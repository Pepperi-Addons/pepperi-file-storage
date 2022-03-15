import { Client, Request } from '@pepperi-addons/debug-server';
import { CdnServers, LOCK_ADAL_TABLE_NAME, METADATA_ADAL_TABLE_NAME } from "../constants";
import { PapiClient } from '@pepperi-addons/papi-sdk/dist/papi-client';
import config from '../../addon.config.json';
import { FindOptions } from '@pepperi-addons/papi-sdk';
import { AbstractS3PfsDal } from './AbstractS3PfsDal';

export class IndexedDataS3PfsDal extends AbstractS3PfsDal 
{
	private papiClient: PapiClient;
	private hostedAddonPapiClient: PapiClient;
    
	constructor(client: Client, request: Request, maximalLockTime:number)
	{
        super(client, request, maximalLockTime);
				 
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			actionUUID: client.ActionUUID,
			addonSecretKey: client.AddonSecretKey
		});

		this.hostedAddonPapiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: this.AddonUUID,
			actionUUID: client.ActionUUID,
			addonSecretKey: this.request.header["x-pepperi-secretkey"]
		});
	}

	//#region IPfsGetter

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

	async downloadFileMetadata(Key: string): Promise<any> 
	{
		const tableName = METADATA_ADAL_TABLE_NAME;
		const downloadRes = await this.getObjectFromTable(this.getAbsolutePath(Key), tableName)
		this.setRelativePathsInMetadata(downloadRes);

		return downloadRes;
	}

	private async getObjectFromTable(key, tableName, getHidden: boolean = false){
		console.log(`Attempting to download the following key from ADAL: ${key}, Table name: ${tableName}`);
		try 
		{
			// Use where clause, since the Keys include '/'s.
			const findOptions: FindOptions = {
				where: `Key='${key}'`,
				include_deleted: getHidden
			}

			const downloaded = await this.papiClient.addons.data.uuid(config.AddonUUID).table(tableName).find(findOptions);
			if(downloaded.length === 1)
			{
				console.log(`File Downloaded`);
				return downloaded[0];
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
				console.error(`Could not find requested item: '${key}'`);

				const err: any = new Error(`Could not find requested item: '${this.getRelativePath(key)}'`);
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

	async isObjectLocked(key: string){
		const tableName = LOCK_ADAL_TABLE_NAME;
		try
		{
			const lockAbsoluteKey = this.getAbsolutePath(key).replace(new RegExp("/", 'g'), "~");
			const getHidden: boolean = true;
			const lockRes: any = await this.getObjectFromTable(lockAbsoluteKey, tableName, getHidden);
			lockRes.Key = this.getRelativePath(lockRes.Key.replace(new RegExp("~", 'g'), "/"));

			return lockRes;
		}
		catch
		{
			return null;
		}
	}

	//#endregion

	//#region IPfsMutator
	async lock(Key: any){
		console.log(`Attempting to lock key: ${Key}`);

		const item: any = {Key : this.getAbsolutePath(Key).replace(new RegExp("/", 'g'), "~")};

		const lockRes =  await this.papiClient.addons.data.uuid(config.AddonUUID).table(LOCK_ADAL_TABLE_NAME).upsert(item);

		lockRes.Key = this.getRelativePath(item.Key.replace(new RegExp("~", 'g'), "/"));

		console.log(`Successfully locked key: ${lockRes.Key}`);

		return lockRes;
	}

	async setRollbackData(item: any) {
		console.log(`Setting rollback data to key: ${item.Key}`);
		const itemCopy = {...item};

		itemCopy.Key = this.getAbsolutePath(item.Key).replace(new RegExp("/", 'g'), "~");

		const lockRes = await this.papiClient.addons.data.uuid(config.AddonUUID).table(LOCK_ADAL_TABLE_NAME).upsert(itemCopy);

		lockRes.Key = this.getRelativePath(itemCopy.Key.replace(new RegExp("~", 'g'), "/"));

		console.log(`Successfully set rollback data for key: ${lockRes.Key}`);

		return lockRes;
	}

	async mutateADAL(newFileFields: any, existingFile: any) {
		return await this.uploadFileMetadata(newFileFields, existingFile);
	}

	async notify(newFileFields: any, existingFile: any){
		//TODO implement.
	}
	
	async unlock(key: string){
		const lockKey = this.getAbsolutePath(key).replace(new RegExp("/", 'g'), "~");

		console.log(`Attempting to unlock object: ${key}`);
		const res = await this.papiClient.addons.data.uuid(config.AddonUUID).table(LOCK_ADAL_TABLE_NAME).key(lockKey).hardDelete(true);
		console.log(`Succcessfully unlocked object: ${key}`);
		return res;
	}


	//#endregion

	//#region private methods
    
	private getRequestedPageNumber(): number
	{
		let res = parseInt(this.request.query.page);
		if(res === 0)
		{
			res++;
		}

		return res;
	}

	private async uploadFileMetadata(newFileFields: any, existingFile: any): Promise<any> 
	{
		// Set metdata to absolute paths
		this.setAbsolutePathsInMetadata(newFileFields, existingFile);
		
		const presignedURL = newFileFields.PresignedURL;
		delete newFileFields.PresignedURL //Don't store PresignedURL in ADAL

		delete existingFile.doesFileExist;

		const res =  await this.papiClient.addons.data.uuid(config.AddonUUID).table(METADATA_ADAL_TABLE_NAME).upsert(newFileFields);

		if(presignedURL){ // Return PresignedURL if there was one
			res.PresignedURL = presignedURL;
		}

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

	private setAbsolutePathsInMetadata(newFileFields: any, existingFile: any) 
	{
		newFileFields.Key = this.getAbsolutePath(newFileFields.Key);

		if (!existingFile.doesFileExist) 
		{
			newFileFields.Folder = this.getAbsolutePath(newFileFields.Folder);

			if (!newFileFields.Key.endsWith('/')) //Add URL if this isn't a folder and this file doesn't exist.
			{
				newFileFields.URL = `${CdnServers[this.environment]}/${newFileFields.Key}`;
			}
			else
			{
				newFileFields.URL = ``;
			}
		}
		if(newFileFields.Thumbnails){
			newFileFields.Thumbnails.forEach(thumbnail => {
				thumbnail.URL = `${CdnServers[this.environment]}/thumbnails/${newFileFields.Key}_${thumbnail.Size}`;
			});
		}
	}

	//#endregion
}