import { Client, Request } from '@pepperi-addons/debug-server';
import { CdnServers, METADATA_ADAL_TABLE_NAME } from "../constants";
import { PapiClient } from '@pepperi-addons/papi-sdk/dist/papi-client';
import config from '../../addon.config.json';
import { FindOptions } from '@pepperi-addons/papi-sdk';
import { AbstractS3PfsDal } from './AbstractS3PfsDal';

const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundently.

export class IndexedDataS3PfsDal extends AbstractS3PfsDal 
{
	private papiClient: PapiClient;
    
	constructor(client: Client, request: Request)
	{
        super(client, request);
				 
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			actionUUID: client.ActionUUID,
			addonSecretKey: client.AddonSecretKey
		});
	}

	async listFolderContents(folderName: string): Promise<any> 
	{
		const folderNameAbsolutePath = this.getAbsolutePath(folderName);

		const findOptions: FindOptions = {
			where: `Folder='${folderName == '/' ? folderNameAbsolutePath : folderNameAbsolutePath.slice(0, -1)}'${this.request.query.where ? "AND(" + this.request.query.where + ")" :""}`,
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

			if (!metadata.Key.endsWith('/')) //Add URL if this isn't a folder and this file doesn't exist.
			{
				metadata.URL = `${CdnServers[this.environment]}/${this.getAbsolutePath(this.request.body.Key)}`;
			}
			else
			{
				metadata.URL = ``;

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
}