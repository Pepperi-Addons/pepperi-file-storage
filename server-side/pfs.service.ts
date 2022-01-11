import { PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { CdnServers, IPfsDownloadObjectResponse, IPfsListFilesResultObjects, S3Buckets } from './constants';
import { mime } from 'mime-types';

const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundently.

class PfsService 
{
	papiClient: PapiClient;
	s3: any;
	DistributorUUID: string;
	AddonUUID: string;
	readonly environment: string;

	constructor(private client: Client, private request: Request) 
	{
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			addonSecretKey: client.AddonSecretKey,
			actionUUID: client.AddonUUID
		});

		// const accessKeyId = "";
		// const secretAccessKey = "";
		// const sessionToken = "";

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
		const res = true;
		try 
		{
			await this.validatAddonSecretKey();
			
			let entryname = this.getAbsolutePath(this.request.body.Key);

			const metadata: {} = this.getMetada();

			let params =  {
					Bucket: S3Buckets[this.environment],
					Key: entryname,
					Metadata: metadata,
				};

			if(this.request.body.URI){ 
				const buf = Buffer.from(this.request.body.URI.split(/base64,/)[1], 'base64');
			
				params["Body"]= buf;
				params["ContentType"]= this.getMimeType();
				params["ContentEncoding"]= 'base64';
							// Uploading files to the bucket (sync)
				const uploaded = await this.s3.upload(params).promise();
				console.log(`File uploaded successfully to ${uploaded.Location}`);

			}
			else{ // if URI == "" then it is creation of a folde
				if(!entryname.endsWith('/'))
					params["Key"]= `${entryname}/`;

				params["ContentType"]= "pepperi/folder";
				const created =  await this.s3.putObject(params).promise()
				console.log(`Folder uploaded successfully `);

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

	private async validatAddonSecretKey() {

		if (!this.request.header["X-Pepperi-SecretKey"] || !await this.isValidRequestedAddon(this.client, this.request.header["X-Pepperi-SecretKey"], this.AddonUUID)) {
			let err: any = new Error("Authorization request denied. check secret key");
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
		if (this.isValidURL(this.request.body.URI)) 
		{
			// Get mime type from received url
			return mime.contentType(this.request.body.URI);
		}
		else 
		{
			// Get mime type from base64 data
			return this.request.body.URI.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
		}
	}


	/**
	 * Returns a Metadata object representing the needed metadata.
	 * @returns a dictionary representation of the metadata.
	 */
	protected getMetada(): {}
	{
		const metadata = {};

		metadata["Sync"] = this.request.body.Sync ? this.request.body.Sync : "None";
		metadata["Hidden"] = this.request.body.Hidden ? this.request.body.Hidden : "None";
		metadata["CreationDateTime"] = this.request.body.CreationDateTime ? this.request.body.CreationDateTime : (new Date()).toISOString();

		if (this.request.body.Description) 
		{
			metadata["Description"] = this.request.body.Description;
		}

		return metadata;
	}

	async downloadFromAWS(): Promise<IPfsDownloadObjectResponse> 
	{
		try 
		{

			const entryname: string = this.getAbsolutePath(this.request.query.key);

			const params = {
				Bucket: S3Buckets[this.environment],
				Key: entryname,
			};

			const splitFileKey = this.request.query.key.split('/');

			// Downloading files from the bucket
			const downloaded: any = await this.s3.headObject(params).promise();

			const response: IPfsDownloadObjectResponse = {
				Key: this.request.query.key,
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

	
	async listFiles(): Promise<IPfsListFilesResultObjects> 
	{
		const response: IPfsListFilesResultObjects = [];
		const requestedPage: number = this.getQueryRequestedPageNumber();
		const pageSize: number = this.request.query.page_size ? parseInt(this.request.query.page_size) : 100;

		let currentPage = 0;
		let prefix = "";
		let folder :string = this.request.query.folder;
		folder = folder.split("'").join("");
		if(folder != '/'){ //  '/' means root folder, so no need to add more '/' in AbsolutePath path  - we will send "";
			prefix = folder.endsWith('/') ? folder : `${folder}/`;

		}
			const params: any = {
			Bucket: S3Buckets[this.environment],
			Prefix: this.getAbsolutePath(prefix),
			Delimiter: '/',
			MaxKeys: pageSize
		};

		try 
		{
			do 
			{
				const objectList = await this.s3.listObjectsV2(params).promise();
				console.log(objectList);

				// Populate the response with the retrieved objects if all of the pages
				// were requested (requestedPage === -1), or if the current page
				// is the requested page.
				if (requestedPage === -1 || currentPage === requestedPage) 
				{
					this.populateListResponseWithObjects(objectList, response);
				}

				currentPage++;
				params.ContinuationToken = objectList.NextContinuationToken;
			}

			// The loop continues as long as the requested page was not yet reached, 
			// or there's a next page.
			while (this.shouldRetrieveNextObjectsListPage(currentPage, requestedPage, params.ContinuationToken));

			console.log(`Files listing done successfully.`);
		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`Could not list files in folder ${this.request.query.folder}. ${err.message}`);
				throw err;
			}
		}

		return response;
	}

	/**
	 * Returns true if there is a next page (a continuationToken was sent), and 
	 * either all pages were requested or the currentPage is not the requestedPage.
	 * @param currentPage the page that was currently retrueved.
	 * @param requestedPage the page that was requested.
	 * @param continuationToken the continuationToken retrieved in the last page.
	 * @returns boolean
	 */
	private shouldRetrieveNextObjectsListPage(currentPage: number, requestedPage: number, continuationToken: string | undefined) 
	{
		const areAllPagesRequested: boolean = requestedPage === -1;
		const res = (continuationToken && (currentPage <= requestedPage || areAllPagesRequested));
		return res;
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
