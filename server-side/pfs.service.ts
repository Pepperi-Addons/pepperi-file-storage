import { FindOptions, PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { CdnServers, IPfsDownloadObjectResponse, IPfsListFilesResultObjects, METADATA_ADAL_TABLE_NAME, S3Buckets } from './constants';
import { mime } from 'mime-types';
import { MetadataService } from 'aws-sdk';

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

		const accessKeyId = "";
		const secretAccessKey = "";
		const sessionToken = "";

		AWS.config.update({
			accessKeyId,
			secretAccessKey,
			sessionToken
		});

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
			const entryname = this.getAbsolutePath(this.request.body.Key);
			const metadata: {} = this.getMetada();
			const buf = Buffer.from(this.request.body.URI.split(/base64,/)[1], 'base64');
			const params = {
				Bucket: S3Buckets[this.environment],
				Key: entryname,
				// Metadata: metadata,
				Body: buf,
				// ContentType: this.getMimeType(),
				ContentEncoding: 'base64'
			};

			// Uploading files to the bucket (sync)
			// const uploaded = await this.s3.upload(params).promise();
			await this.upsertMetadataToAdal();

			// console.log(`File uploaded successfully to ${uploaded.Location}`);
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
		const metadata = this.getMetada();	
		return this.papiClient.addons.data.uuid(this.AddonUUID).table(METADATA_ADAL_TABLE_NAME).upsert(metadata);
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
	protected getMetada(): {Key: string, Sync: string, Hidden: boolean, MIME: string, Folder: string, Description?: string}
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
