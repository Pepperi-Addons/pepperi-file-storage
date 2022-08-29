import { Client, Request } from '@pepperi-addons/debug-server';
import { CdnServers, LOCK_ADAL_TABLE_NAME, SECRETKEY_HEADER, TransactionType } from "../constants";
import { PapiClient } from '@pepperi-addons/papi-sdk/dist/papi-client';
import config from '../../addon.config.json';
import { AddonData, FindOptions } from '@pepperi-addons/papi-sdk';
import { AbstractS3PfsDal } from './AbstractS3PfsDal';
import { Helper } from '../helper';

export class IndexedDataS3PfsDal extends AbstractS3PfsDal 
{
	private papiClient: PapiClient;
    
	constructor(client: Client, request: Request, maximalLockTime:number)
	{
        super(client, request, maximalLockTime);
		
		//Used for operations on the lock table.
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			actionUUID: client.ActionUUID,
			addonSecretKey: client.AddonSecretKey
		});
	}

	//#region IPfsGetter

	async getObjects(whereClause?: string): Promise<AddonData[]>
	{
		const findOptions: FindOptions = {
			...(this.request.query && this.request.query.where && {where: this.request.query.where}),
			...(whereClause && {where: whereClause}), // If there's a where clause, use it instead 
			...(this.request.query && this.request.query.page_size && {page_size: parseInt(this.request.query.page_size)}),
			...(this.request.query && this.request.query.page && {page: this.getRequestedPageNumber()}),
			...(this.request.query && this.request.query.fields && {fields: this.request.query.fields}),
			...(this.request.query && this.request.query.order_by && {order_by: this.request.query.order_by}),
			...(this.request.query && this.request.query.include_count && {include_count: this.request.query.include_count}),
			...(this.request.query && this.request.query.include_deleted && {include_deleted: this.request.query.include_deleted}),
		}

		const getPfsTableName = Helper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);
		const res =  await this.papiClient.addons.data.uuid(config.AddonUUID).table(getPfsTableName).find(findOptions);

		console.log(`Files listing done successfully.`);
		return res;
	}

	async getLockedObjects(findOptions: FindOptions): Promise<AddonData[]> {
		const tableName = LOCK_ADAL_TABLE_NAME;
		let res = await this.papiClient.addons.data.uuid(config.AddonUUID).table(tableName).find(findOptions);
		res.map(item => {
			if(item?.Key)
			{
				item.Key = item.Key.replace(new RegExp("~", 'g'), "/");
			}
		});

		return res;
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

	/**
     * Returns the lock data if the key is locked, null otherwise.
     * @param relativeKey the key to check.
     */
	async isObjectLocked(key: string){
		let res: any = null;
		const tableName = LOCK_ADAL_TABLE_NAME;
		try
		{
			const lockAbsoluteKey = this.getAbsolutePath(key).replace(new RegExp("/", 'g'), "~");
			const getHidden: boolean = true;
			res = await this.getObjectFromTable(lockAbsoluteKey, tableName, getHidden);
			res.Key = this.getRelativePath(res.Key.replace(new RegExp("~", 'g'), "/"));
		}
		catch // If the object isn't locked, the getObjectFromTable will throw an "object not found" error. Return null to indicate this object isn't locked.
		{}

		return res;
	}

	//#endregion

	//#region IPfsMutator
	async lock(Key: any, transactionType: TransactionType, executionUUID?: string){
		console.log(`Attempting to lock key: ${Key}`);

		const item: any = 
						{
							Key : this.getAbsolutePath(Key).replace(new RegExp("/", 'g'), "~"),
							TransactionType : transactionType,
							...(executionUUID && {ExecutionUUID: executionUUID})
						};

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
		let res: any;
		newFileFields.Key = this.removeSlashPrefix(newFileFields.Key);
		newFileFields.Folder = this.removeSlashPrefix(newFileFields.Folder);
		// Set Urls
		this.setUrls(newFileFields, existingFile);
		
		const presignedURL = newFileFields.PresignedURL;
		delete newFileFields.PresignedURL //Don't store PresignedURL in ADAL


		const tableName = Helper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);
        res = await this.papiClient.addons.data.uuid(config.AddonUUID).table(tableName).upsert(newFileFields);
		
		// Add back the PresignedURL
		res.PresignedURL = presignedURL;
		
		return res;
	}

	private setUrls(newFileFields: any, existingFile: any) 
	{

		if (!existingFile.doesFileExist) 
		{
			if (!newFileFields.Key.endsWith('/')) //Add URL if this isn't a folder and this file doesn't exist.
			{
				newFileFields.URL = `${CdnServers[this.environment]}/${this.getAbsolutePath(newFileFields.Key)}`;
			}
			else
			{
				newFileFields.URL = ``;
			}
		}
		if(newFileFields.Thumbnails){
			newFileFields.Thumbnails.forEach(thumbnail => {
				thumbnail.URL = `${CdnServers[this.environment]}/thumbnails/${this.getAbsolutePath(newFileFields.Key)}_${thumbnail.Size}`;
			});
		}
	}

	//#endregion
}