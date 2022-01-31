import { FindOptions, PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { MetadataService } from 'aws-sdk';
import { CdnServers, dataURLRegex, IPfsDownloadObjectResponse, IPfsListFilesResultObjects, S3Buckets, METADATA_ADAL_TABLE_NAME } from './constants';
import { mime } from 'mime-types';
import { createTextChangeRange, idText } from 'typescript';
import fetch from 'node-fetch';

const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundently.

class PfsService 
{
	papiClient: PapiClient;
	s3: any;
	DistributorUUID: string;
	AddonUUID: string;
	readonly environment: string;
	readonly MIME_FIELD_IS_MISSING = "Missing mandatory field 'MIME'";
	syncTypes = ["None", "Device", "DeviceThumbnail", "Always"];

	constructor(private client: Client, private request: Request) 
	{
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			addonSecretKey: client.AddonSecretKey,
			actionUUID: client.AddonUUID
		});


		// const accessKeyId=""
		// const secretAccessKey=""
		// const sessionToken=""
		// AWS.config.update({
		// 	accessKeyId,
		// 	secretAccessKey,
		// 	sessionToken
		// });
				 
				 
		this.environment = jwtDecode(client.OAuthAccessToken)['pepperi.datacenter'];
		this.DistributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];
		this.AddonUUID = this.request.query.addon_uuid;
		this.s3 = new AWS.S3();
				
	}

	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. An absolute path is a path that includes the Distributor's UUID, 
	 * the Addon's UUID and the trailing requested path.
	 * @param relativePath the path relative to the addon's folder
	 * @returns a string in the format ${this.DistributorUUID}/${this.AddonUUID}/${relativePath}
	 */
	private getAbsolutePath(relativePath: string): string 
	{
		if(relativePath.startsWith('/'))
			relativePath = relativePath.slice(1);;

		return `${this.DistributorUUID}/${this.AddonUUID}/${relativePath}`;
	}

	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. A relative path is a path that's relative to the addon's folder.
	 * @param absolutePath the original path the addon requested
	 * @returns a relative path string
	 */
	private getRelativePath(absolutePath: string): string 
	{
		return absolutePath.split(`${this.DistributorUUID}/${this.AddonUUID}/`)[1];
	}

	async uploadToAWS(): Promise<boolean> 
	{
		let res:any = {};
		try 
		{
			await this.validatAddonSecretKey();

			let entryname = this.getAbsolutePath(this.request.body.Key);

			let file: any = await this.getFileIfExistsOnS3();

			this.validateFieldsForUpload(file);

			let params =  {
				Bucket: S3Buckets[this.environment],
				Key: entryname
			};

			if(this.request.body.Hidden != true) {
				if(this.request.body.Key.endsWith('/')) 
				{ // if the key ends with '/' it means we are creating a folder 
					res = await this.createFolder(params);
				}  
				else //file post
				{
					res = await this.postFile(file,params, res);
				}
			}
			// else{ // update the hidden=true in the MetaData (this part will be deleted when we will have adal support) 
			// 	file.Hidden = true;
			// 	res = file; 
			// }

			await this.upsertMetadataToAdal();
		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`Could not upload file ${this.request.body.Key} to S3. ${err.message}`);
			}
			throw err;
		}
		return res;
	}
	upsertMetadataToAdal() {
		const metadata = this.getMetadata();	
		return this.papiClient.addons.data.uuid(this.AddonUUID).table(METADATA_ADAL_TABLE_NAME).upsert(metadata);
	}


	private async getFileIfExistsOnS3() {
		let file: any = null;

		try {
			file = await this.downloadFromAWS();

		} catch (e) { // if file not exist on S3 it will throw exception
			if (e instanceof Error) 
			{
				console.log(e.message);
			}
		}
		return file;
	}

	private async postFile(file:IPfsDownloadObjectResponse, params: any, res: any) {

		let setPresignedURL = false;
		if(!file && !this.request.body.URI){
			 // in case "URI" is not provided on Creation (that is why the check if file exists) a PresignedURL will be returned 
			 this.request.body.URI = `data:${this.request.body.MIME};base64,`; // creating an empty file to set all the metadata
			 setPresignedURL = true;
		}
		if (this.request.body.URI){
			let buf: Buffer;
			if (this.isDataURL(this.request.body.URI)) { // dataURI get the base 64 part
				buf = Buffer.from(this.request.body.URI.match(dataURLRegex)[4], 'base64');
			}
			else { //the URI is URL - downalod the data
				let respons = await fetch(this.request.body.URI, { method: `GET` });
				var arrayData = await respons.arrayBuffer();;
				buf = Buffer.from(arrayData);
			}
	
			params["Body"] = buf;
			params["ContentType"] = this.getMimeType();
			params["ContentEncoding"] = 'base64';

			// Uploading files to the bucket (sync)
			const uploaded = await this.s3.upload(params).promise(); 
			console.log(`File uploaded successfully to ${uploaded.Location}`);
		}

		res = await this.downloadFromAWS(this.request.body.Key);


		if(setPresignedURL)
			res["PresignedURL"] = await  this.generatePreSignedURL(params.Key); // creating presignedURL

		return res;
	}

	private async createFolder(params: { Bucket: any; Key: string; }) {

		if(this.request.body.MIME == 'pepperi/folder')
		{
			params["ContentType"] = "pepperi/folder";
			const created = await this.s3.putObject(params).promise();
			console.log(`Folder uploaded successfully `);

			const relativePath: string = this.request.body.Key;
			const splitFileKey = relativePath.split('/');
			splitFileKey.pop(); // folders look like "folder/sub_folder/sub_subfolder/", so splitting by '/' results in a trailing "" 
								// which we need to pop in order ot get the actual folder name.
								
			return {
					Key: this.request.body.Key,
					Name: `${splitFileKey.pop()}/`,
					Folder: splitFileKey.join('/'),
					MIME: "pepperi/folder",
				};
		}
		else
		{
			throw new Error("Folder MIME must be 'pepperi/folder'");
		}
		
	}

	 async generatePreSignedURL(entryName){
		let params =  {
			Bucket: S3Buckets[this.environment],
			Key: entryName,
		};
		let urlString = "";

		var date = new Date();
		params["Expires"] = 24*60*60;
			
		urlString = await  this.s3. getSignedUrl('putObject',params);
		return urlString;
	 }
		


    isDataURL(s) {
        return !!s.match(dataURLRegex);
    }

	private validateFieldsForUpload(file) {
		if (!this.request.body.Key) {
			throw new Error("Missing mandatory field 'Key'");
		}
		else if (this.request.body.Key.endsWith('/') && !this.request.body.MIME) { 
			// if the key ends with '/' it means we are creating a folder,so MIME is mandatory because it is mandatory on creation
			//(need to check in other place if it is not folder creation, if the file exists anf if not then it is creation and MIME id mandatory also)
			throw new Error(this.MIME_FIELD_IS_MISSING);
		}
		else if(this.request.body.MIME == 'pepperi/folder' && !this.request.body.Key.endsWith('/')){
			// if 'pepperi/folder' is provided on creation and the key is not ending with '/' the POST should fail
			throw new Error("On creation of a folder, the key must ends with '/'");

		}

		if(!file && !this.request.body.MIME ){
			throw new Error("Missing mandatory field 'MIME'");

		}

	}

	private async validatAddonSecretKey() {

		if (!this.request.header["X-Pepperi-SecretKey"] || !await this.isValidRequestedAddon(this.client, this.request.header["X-Pepperi-SecretKey"], this.AddonUUID)) {

			let err: any = new Error(`Authorization request denied. ${this.request.header["X-Pepperi-SecretKey"]? "check secret key" : "Missing secret key header"} `);
			err.code = 401;
			throw err;
		}
	}

	private async  isValidRequestedAddon(client: Client, secretKey, addonUUID){
		const papiClient = new PapiClient({
		  baseURL: client.BaseURL,
		  token: client.OAuthAccessToken,
		  addonUUID: addonUUID,
		  actionUUID: client.ActionUUID,
		  addonSecretKey: secretKey
		});

		try{
			var res = await papiClient.get(`/var/sk/addons/${addonUUID}/validate`);
			return true;
		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`${err.message}`);
			}
			return false;
		}

	}


	private isValidURL(s): boolean 
	{
		let url: URL;
		try 
		{
			url = new URL(s);
		}
		catch (e) 
		{
			return false;
		}

		return url.protocol === "http:" || url.protocol === "https:";
	}

	private getMimeType(): string 
	{
		var MIME = this.request.body.MIME;
		/*if (this.isValidURL(this.request.body.URI)) ///-------> does not work
		{
			// Get mime type from received url
			MIME =  mime.contentType(this.request.body.URI);
		}*/
		if(this.isDataURL(this.request.body.URI))
		{
			// Get mime type from base64 data
			MIME = this.request.body.URI.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
		}


		return MIME;
	}


	/**
	 * Returns a Metadata object representing the needed metadata.
	 * @returns a dictionary representation of the metadata.
	 */
	protected getMetadata(): {Key: string, Sync: string, Hidden: boolean, MIME: string, Folder: string, Description?: string}
	{
		const pathFoldersList = this.request.body.Key.split('/');
		if (this.request.body.Key.endsWith('/')) {//This is a new folder being created...
			pathFoldersList.pop();
		}
		const containingFolder = pathFoldersList.join('/');
		
		const metadata = {
			Key: this.getAbsolutePath(this.request.body.Key),
			Folder: containingFolder,
			Sync: this.request.body.Sync ? this.request.body.Sync : "None",
			Hidden: this.request.body.Hidden ? this.request.body.Hidden : false,
			MIME: this.getMimeType(),
			...(this.request.body.Description && {Description: this.request.body.Description})
		};

		return metadata;
	}

	/**
	 * Download the file from AWS.
	 * @param Key Optional Key to download. Otherwise, this.request.query.Key will be used. 
	 * @returns 
	 */
	async downloadFromAWS(Key? : string): Promise<IPfsDownloadObjectResponse> 
	{
		const downloadKey = Key ?? this.request.query.Key; 
		console.log(`Attempting to download the following key from AWS: ${downloadKey}`)
		try 
		{
			let response:any = null;

			const entryname: string = this.getAbsolutePath(downloadKey);

			const params = {
				Bucket: S3Buckets[this.environment],
				Key: entryname,
			};
	
			// Downloading files from the bucket
			const downloaded: any = await this.s3.headObject(params).promise();
			 if(downloaded.Metadata.hidden != true){
				const splitFileKey = downloadKey.split('/');

				response = {
					Key: downloadKey,
					Name: splitFileKey.pop(), //The last part of the path is the object name
					Folder: splitFileKey.join('/'), // the rest of the path is its folder.
					Sync: downloaded.Metadata.sync ? downloaded.Metadata.sync : "None",
					MIME: downloaded.ContentType,
					URL: `${CdnServers[this.environment]}/${entryname}`,
					Hidden: downloaded.Metadata.hidden ? downloaded.Metadata.hidden : false,
					CreationDateTime: downloaded.Metadata.creationDateTime,
					...(downloaded.Metadata.description && { Description: downloaded.Metadata.description }),
				}
	
				console.log(`File Downloaded`);
			 }


			return response;
		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`${err.message}`);
			}
			throw (err);
		}
	}

	
	async listFiles()//: Promise<IPfsListFilesResultObjects> 
	{
		const response: IPfsListFilesResultObjects = [];
		// const requestedPage: number = this.getQueryRequestedPageNumber();
		// const pageSize: number = this.request.query.page_size ? parseInt(this.request.query.page_size) : 100;

		// let currentPage = 0;
		// const params: any = {
		// 	Bucket: S3Buckets[this.environment],
		// 	Prefix: this.getAbsolutePath(this.request.query.folder),
		// 	Delimiter: '/',
		// 	MaxKeys: pageSize
		// };

		try 
		{
		// 	do 
		// 	{
		// 		const objectList = await this.s3.listObjectsV2(params).promise();
		// 		console.log(objectList);

		// 		// Populate the response with the retrieved objects if all of the pages
		// 		// were requested (requestedPage === -1), or if the current page
		// 		// is the requested page.
		// 		if (requestedPage === -1 || currentPage === requestedPage) 
		// 		{
		// 			this.populateListResponseWithObjects(objectList, response);
		// 		}

		// 		currentPage++;
		// 		params.ContinuationToken = objectList.NextContinuationToken;
		// 	}

		// 	// The loop continues as long as the requested page was not yet reached, 
		// 	// or there's a next page.
		// 	while (this.shouldRetrieveNextObjectsListPage(currentPage, requestedPage, params.ContinuationToken));
		// export interface FindOptions {
		// 	fields?: string[];
		// 	where?: string;
		// 	order_by?: string;
		// 	page?: number;
		// 	page_size?: number;
		// 	include_nested?: boolean;
		// 	full_mode?: boolean;
		// 	include_deleted?: boolean;
		// 	is_distinct?: boolean;
		// }
			const findOptions: FindOptions = {
				where: `Folder = ${this.getAbsolutePath(this.request.body.Key.slice(0, -1))} ${this.request.query.where ? "AND this.request.query.where" : ""}`,
				...(this.request.query.page_size && {page_size: parseInt(this.request.query.page_size)}),
				...(this.request.query.page && {page: parseInt(this.request.query.page)}),
				...(this.request.query.fields && {fields: this.request.query.fields}),
			}

			const res =  await this.papiClient.addons.data.uuid(this.AddonUUID).table(METADATA_ADAL_TABLE_NAME).find(findOptions);

			console.log(`Files listing done successfully.`);
			return res;

		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`Could not list files in folder ${this.request.query.folder}. ${err.message}`);
				throw err;
			}
		}

		// }
		// catch (err) 
		// {
		// 	if (err instanceof Error) 
		// 	{
		// 		console.error(`Could not list files in folder ${this.request.body.filename}. ${err.message}`);
		// 		throw err;
		// 	}
		// }

		// return response;
	}

	

	getQueryRequestedPageNumber(): number 
	{
		let res: number = this.request.query.page ? parseInt(this.request.query.page) : 0;
		
		// Pagination first page is 0
		if(res === 1)
		{
			res = 0;
		}

		return res;
	}

	private populateListResponseWithObjects(objectList, response: IPfsListFilesResultObjects) 
	{
		objectList.Contents?.forEach(object => 
		{
			const relativePath: string = this.getRelativePath(object.Key ? object.Key : "");
			const splitFileKey = relativePath.split('/');
			if(splitFileKey[splitFileKey.length - 1]) // dont push the hidden file (it doesnt have name) that is being created when creating a folder withot file
				response.push({
					Key: relativePath,
					Name: `${splitFileKey.pop()}`,
					Folder: splitFileKey.join('/'),
					URL: `${CdnServers[this.environment]}/${object.Key}`,
					ModificationDateTime: object.LastModified?.toISOString()
				});
		});

		objectList.CommonPrefixes?.forEach(object => 
		{
			const relativePath: string = this.getRelativePath(object.Prefix ? object.Prefix : "");
			const splitFileKey = relativePath.split('/');
			splitFileKey.pop(); // folders look like "folder/sub_folder/sub_subfolder/", so splitting by '/' results in a trailing "" 

			// which we need to pop in order ot get the actual folder name.
			response.push({
				Key: relativePath,
				Name: `${splitFileKey.pop()}/`,
				Folder: splitFileKey.join('/'),
				MIME: "pepperi/folder",
			});
		});
	}
}

export default PfsService;
