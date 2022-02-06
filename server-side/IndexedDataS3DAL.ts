import { Client, Request } from '@pepperi-addons/debug-server';
import { CdnServers, dataURLRegex, IPfsDal, METADATA_ADAL_TABLE_NAME, S3Buckets } from "./constants";
import jwtDecode from 'jwt-decode';
import { PapiClient } from '@pepperi-addons/papi-sdk/dist/papi-client';
import config from '../addon.config.json';
import { FindOptions } from '@pepperi-addons/papi-sdk';


const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundently.


export class IndexedDataS3DAL implements IPfsDal
{
	private s3: any;
	private environment: any;
	private DistributorUUID: any;
	private AddonUUID: any;
	private S3Bucket: any;
	private papiClient: PapiClient;
    
	constructor(private client: Client, private request: Request)
	{

		// const accessKeyId=""
		// const secretAccessKey=""
		// const sessionToken=""
		// AWS.config.update({
		// 	accessKeyId,
		// 	secretAccessKey,
		// 	sessionToken
		// });
				 
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			actionUUID: client.ActionUUID,
			addonSecretKey: client.AddonSecretKey
		});
          
		this.environment = jwtDecode(client.OAuthAccessToken)['pepperi.datacenter'];
		this.DistributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];
		this.AddonUUID = this.request.query.addon_uuid;
		this.s3 = new AWS.S3();
		this.S3Bucket = S3Buckets[this.environment];

	}

	async listFolderContents(folderName: string): Promise<any> 
	{
		const findOptions: FindOptions = {
			where: `Folder='${this.getAbsolutePath(folderName)}'${this.request.query.where ? "AND(" + this.request.query.where + ")" :""}`,
			...(this.request.query.page_size && {page_size: parseInt(this.request.query.page_size)}),
			...(this.request.query.page && {page: this.getRequestedPageNumber()}),
			...(this.request.query.fields && {fields: this.request.query.fields}),
			...(this.request.query.order_by && {order_by: this.request.query.order_by}),
			...(this.request.query.include_count && {include_count: this.request.query.include_count}),
			...(this.request.query.include_deleted && {include_deleted: this.request.query.include_deleted}),
		}

		const res =  await this.papiClient.addons.data.uuid(config.AddonUUID).table(METADATA_ADAL_TABLE_NAME).find(findOptions);

		res.map(file => 
		{
			return this.setRelativePathsInMetadata(file);
		});

		console.log(`Files listing done successfully.`);
		return res;
	}
    
	private getRequestedPageNumber(): number
	{
		let res = parseInt(this.request.query.page);
		if(res === 0)
		{
			res++;
		}

		return res;
	}

	async uploadFileData(Key: string, Body: Buffer): Promise<any> 
	{
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = this.getAbsolutePath(Key);
		params.Body = Body;
		params.ContentType = this.getMimeType();
		params.ContentEncoding = 'base64';

		// Upload to S3 bucket.
		const uploaded = await this.s3.upload(params).promise();
		console.log(`File uploaded successfully to ${uploaded.Location}`);

		return uploaded;
	}

	private getMimeType(): any 
	{
		let MIME = this.request.body.MIME;
		if(this.request.body.URI && this.isDataURL(this.request.body.URI))
		{
			// Get mime type from base64 data
			MIME = this.request.body.URI.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
		}

		return MIME;
	}

	private isDataURL(s) 
	{
		return !!s.match(dataURLRegex);
	}

	async uploadFileMetadata(metadata: any, doesFileExist: boolean): Promise<any> 
	{
		// Set metdata to absolute paths
		this.setAbsolutePathsInMetadata(metadata, doesFileExist);
		const res =  await this.papiClient.addons.data.uuid(config.AddonUUID).table(METADATA_ADAL_TABLE_NAME).upsert(metadata);

		this.setRelativePathsInMetadata(res);

		return res;
	}

	private setRelativePathsInMetadata(res) 
	{
		if(res.Key)
		{
			res.Key = this.getRelativePath(res.Key);
		}
		if(res.Folder)
		{
			res.Folder = this.getRelativePath(res.Folder);
		}
	}

	private setAbsolutePathsInMetadata(metadata: any, doesFileExist: boolean) 
	{
		metadata.Key = this.getAbsolutePath(metadata.Key);

		if (!doesFileExist) 
		{
			metadata.Folder = this.getAbsolutePath(metadata.Folder);

			if (!metadata.Key.endsWith('/')) 
			{ //Add URL if this isn't a folder and this file doesn't exist.
				metadata.URL = `${CdnServers[this.environment]}/${this.getAbsolutePath(this.request.body.Key)}`;
			}
		}
	}

	async downloadFileMetadata(Key: string): Promise<any> 
	{
		Key = this.getAbsolutePath(Key);
		console.log(`Attempting to download the following key from ADAL: ${Key}`)
		try 
		{
			let res: any = null;
			// Use where clause, since the Keys include '/'s.
			const findOptions: FindOptions = {
				where: `Key='${Key}'`
			}

			const downloaded = await this.papiClient.addons.data.uuid(config.AddonUUID).table(METADATA_ADAL_TABLE_NAME).find(findOptions);
			if(downloaded.length === 1)
			{
				console.log(`File Downloaded`);
				res = downloaded[0]
				this.setRelativePathsInMetadata(res);
				return res;
			}
			else if(downloaded.length > 1)
			{
				console.error(`Internal error. Found more than one file with the given key. Where clause: ${findOptions.where}`);
				
				const err: any = new Error(`Internal error.`);
				err.code = 500;
				throw err;
			}
			else 
			{ //Couldn't find results
				console.error(`Could not find requested item: '${Key}'`);

				const err: any = new Error(`Could not find requested item: '${this.getRelativePath(Key)}'`);
				err.code = 404;
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
		const relativePath = absolutePath.split(`${this.DistributorUUID}/${this.AddonUUID}/`)[1]
		const res = relativePath === '' ? '/' : relativePath; // Handle root folder case
		return res;
	}
}
