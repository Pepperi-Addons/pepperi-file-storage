import { FindOptions, PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { CdnServers, dataURLRegex, IPfsDownloadObjectResponse, IPfsListFilesResultObjects, S3Buckets, METADATA_ADAL_TABLE_NAME } from './constants';

import fetch from 'node-fetch';
import config from '../addon.config.json';

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
			relativePath = relativePath.slice(1);

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
			await this.validateAddonSecretKey();

			const doesFileExist: boolean = !!(await this.getFileIfExistsOnS3());
			this.validateFieldsForUpload(doesFileExist);

			if(this.request.body.Key.endsWith('/')) 
			{ // if the key ends with '/' it means we are creating a folder 
				res = await this.createFolder(doesFileExist);
			}
			else //file post
			{
				res = await this.postFile(doesFileExist);
			}
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

	upsertMetadataToAdal(doesFileExist: boolean) 
	{
		const metadata = this.getMetadata(doesFileExist);	
		return this.papiClient.addons.data.uuid(config.AddonUUID).table(METADATA_ADAL_TABLE_NAME).upsert(metadata);
	}

	private async getFileIfExistsOnS3() 
	{
		let file: any = {};

		try 
		{
			file = await this.downloadFromAWS();
		}
		catch (e) 
		{ 
			if (e instanceof Error) 
			{
				console.log(e.message);
			}
		}
		return file;
	}

	private async postFile(doesFileExist: boolean) 
	{
		let res: any = {};

		let setPresignedURL: boolean = false;
		const entryname: string = this.getAbsolutePath(this.request.body.Key);
		const params =  {
			Bucket: S3Buckets[this.environment],
			Key: entryname
		};
		
		if(!doesFileExist && !this.request.body.URI)
		{
			 // in case "URI" is not provided on Creation (that is why the check if file exists) a PresignedURL will be returned 
			 this.request.body.URI = `data:${this.request.body.MIME};base64,`; // creating an empty file to set all the metadata
			 setPresignedURL = true;
		}
		if (this.request.body.URI)
		{
			let buf: Buffer;
			if (this.isDataURL(this.request.body.URI)) 
			{ // dataURI get the base 64 part
				buf = Buffer.from(this.request.body.URI.match(dataURLRegex)[4], 'base64');
			}
			else 
			{ //the URI is URL - downalod the data
				const respons = await fetch(this.request.body.URI, { method: `GET` });
				const arrayData = await respons.arrayBuffer();
				buf = Buffer.from(arrayData);
			}
	
			params["Body"] = buf;
			params["ContentType"] = this.getMimeType();
			params["ContentEncoding"] = 'base64';

			// Uploading files to the bucket (sync)
			const uploaded = await this.s3.upload(params).promise();
			console.log(`File uploaded successfully to ${uploaded.Location}`);
		}

		await this.upsertMetadataToAdal(doesFileExist);
		console.log(`File metadata successfuly uploaded to ADAL.`);

		res = await this.downloadFromAWS();


		if(setPresignedURL)
			res["PresignedURL"] = await this.generatePreSignedURL(params.Key); // creating presignedURL

		return res;
	}

	private async createFolder(doesFileExist:boolean) 
	{
		if(this.request.body.MIME == 'pepperi/folder')
		{
			const upload = await this.upsertMetadataToAdal(doesFileExist);
			delete upload.BasePath;
			return upload;
		}
		else
		{
			throw new Error("Folder MIME must be 'pepperi/folder'");
		}
	}

	async generatePreSignedURL(entryName)
	{
		const params =  {
			Bucket: S3Buckets[this.environment],
			Key: entryName,
		};
		let urlString = "";

		const date = new Date();
		params["Expires"] = 24*60*60;
			
		urlString = await  this.s3.getSignedUrl('putObject',params);
		return urlString;
	}
		
	isDataURL(s) 
	{
		return !!s.match(dataURLRegex);
	}

	private validateFieldsForUpload(doesFileExist: boolean) 
	{
		if (!this.request.body.Key) 
		{
			throw new Error("Missing mandatory field 'Key'");
		}
		else if (this.request.body.Key.endsWith('/') && !this.request.body.MIME) 
		{ 
			// if the key ends with '/' it means we are creating a folder,so MIME is mandatory because it is mandatory on creation
			//(need to check in other place if it is not folder creation, if the file exists anf if not then it is creation and MIME id mandatory also)
			throw new Error(this.MIME_FIELD_IS_MISSING);
		}
		else if(this.request.body.MIME == 'pepperi/folder' && !this.request.body.Key.endsWith('/'))
		{
			// if 'pepperi/folder' is provided on creation and the key is not ending with '/' the POST should fail
			throw new Error("On creation of a folder, the key must ends with '/'");

		}

		if(!doesFileExist && !this.request.body.MIME )
		{
			throw new Error("Missing mandatory field 'MIME'");

		}

	}

	private async validateAddonSecretKey() 
	{
		if (!this.request.header["X-Pepperi-SecretKey"] || !await this.isValidRequestedAddon(this.client, this.request.header["X-Pepperi-SecretKey"], this.AddonUUID)) 
		{

			const err: any = new Error(`Authorization request denied. ${this.request.header["X-Pepperi-SecretKey"]? "check secret key" : "Missing secret key header"} `);
			err.code = 401;
			throw err;
		}
	}

	private async  isValidRequestedAddon(client: Client, secretKey, addonUUID)
	{
		const papiClient = new PapiClient({
		  baseURL: client.BaseURL,
		  token: client.OAuthAccessToken,
		  addonUUID: addonUUID,
		  actionUUID: client.ActionUUID,
		  addonSecretKey: secretKey
		});

		try
		{
			const res = await papiClient.get(`/var/sk/addons/${addonUUID}/validate`);
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
		let MIME = this.request.body.MIME;
		if(this.request.body.URI && this.isDataURL(this.request.body.URI))
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
	protected getMetadata(doesFileExist:boolean): {Key: string, Sync: string, Hidden: boolean, MIME: string, Folder: string, Description?: string}
	{

		const pathFoldersList = this.request.body.Key.split('/');
		if (this.request.body.Key.endsWith('/')) 
		{//This is a new folder being created...
			pathFoldersList.pop();
		}
		const fileName = pathFoldersList.pop();
		const containingFolder = pathFoldersList.join('/');
		
		const metadata = {
			Key: this.request.body.Key,
			...(!doesFileExist && { // These fields are static, and are derived from the files's Key, which is immutable.
									// We need to create them only once, and they are never changed.
				Name: `${fileName}${this.request.body.Key.endsWith('/') ? '/' :''}`,
				Folder: containingFolder,
				BasePath: `${this.DistributorUUID}/${this.AddonUUID}/`
			}),
			...(!doesFileExist && !this.request.body.Key.endsWith('/') && {URL: `${CdnServers[this.environment]}/${this.getAbsolutePath(this.request.body.Key)}`}), //Add URL if this isn't a folder and this file doesn't exist.
			...((this.request.body.MIME || !doesFileExist) && {MIME: this.getMimeType()}), // Set MIME if it was passed, or if this file doesn't exist yet.
			...(this.request.body.Sync && {Sync: this.request.body.Sync}), // Set Sync if it was passed
			...(this.request.body.Hidden && {Hidden: this.request.body.Hidden}), // Set Hidden if it was passed
			...(this.request.body.Description && {Description: this.request.body.Description}) // Add a description if it was passed.
		};

		return metadata;
	}

	/**
	 * Download the file from AWS.
	 * @returns 
	 */
	async downloadFromAWS() 
	{
		const downloadKey = this.request.body && this.request.body.Key ? this.request.body.Key : this.request.query.Key; 
		console.log(`Attempting to download the following key from ADAL: ${downloadKey}`)
		try 
		{
	
			let res: any = {};
			// Downloading files from the bucket
			const findOptions: FindOptions = {
				where: `Key='${downloadKey}' AND BasePath='${this.DistributorUUID}/${this.AddonUUID}/'`
			}

			const downloaded = await this.papiClient.addons.data.uuid(config.AddonUUID).table(METADATA_ADAL_TABLE_NAME).find(findOptions);
			if(downloaded.length === 1)
			{
				delete downloaded[0].BasePath
				console.log(`File Downloaded`);
				res = downloaded[0];
			}
			else if(downloaded.length > 1){
				const err: any = new Error(`Internal error.`);
				console.error(`Internal error. Found more than one file with the given key. Where clause: ${findOptions.where}`);
				err.code = 500;
				throw err;
			}

			return res;
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
		try 
		{
			const findOptions: FindOptions = {
				where: `Folder=${this.request.query.folder.slice(0, -1)} AND BasePath='${this.DistributorUUID}/${this.AddonUUID}/'${this.request.query.where ?? ""}`,
				...(this.request.query.page_size && {page_size: parseInt(this.request.query.page_size)}),
				...(this.request.query.page && {page: parseInt(this.request.query.page)}),
				...(this.request.query.fields && {fields: this.request.query.fields}),
			}

			const res =  await this.papiClient.addons.data.uuid(config.AddonUUID).table(METADATA_ADAL_TABLE_NAME).find(findOptions);

			res.map(file => {
				delete file.BasePath;
				return file
			});

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
	}
}

export default PfsService;