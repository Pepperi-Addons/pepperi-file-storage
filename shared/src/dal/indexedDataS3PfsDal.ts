import { Request } from '@pepperi-addons/debug-server';
import { AddonData, FindOptions } from '@pepperi-addons/papi-sdk';
import { AbstractS3PfsDal } from './abstractS3PfsDal';
import { CdnServers, LOCK_ADAL_TABLE_NAME, SharedHelper, TransactionType } from '../';
import { IAws } from './iAws';
import { IPepperiDal } from './iPepperiDal';

export class IndexedDataS3PfsDal extends AbstractS3PfsDal
{    
	constructor(OAuthAccessToken: string, request: Request, maximalLockTime:number, iAws: IAws, protected pepperiDal: IPepperiDal)
	{
		super(OAuthAccessToken, request, maximalLockTime, iAws);
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
		};

		const getPfsTableName = SharedHelper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);
		const res =  await this.pepperiDal.getDataFromTable(getPfsTableName, findOptions);

		console.log(`Files listing done successfully.`);
		return res;
	}

	private async getObjectFromTable(key, tableName, getHidden = false)
	{
		console.log(`Attempting to download the following key from ADAL: ${key}, Table name: ${tableName}`);
		try 
		{
			// Use where clause, since the Keys include '/'s.
			const findOptions: FindOptions = {
				where: `Key='${key}'`,
				include_deleted: getHidden
			};
			const downloaded =  await this.pepperiDal.getDataFromTable(tableName, findOptions);
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

				const err: any = new Error(`Could not find requested item: '${this.relativeAbsoluteKeyService.getRelativePath(key)}'`);
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
	async isObjectLocked(key: string)
	{
		let res: any = null;
		const tableName = LOCK_ADAL_TABLE_NAME;
		try
		{
			const lockAbsoluteKey = this.relativeAbsoluteKeyService.getAbsolutePath(key).replace(new RegExp("/", 'g'), "~");
			const getHidden = true;
			res = await this.getObjectFromTable(lockAbsoluteKey, tableName, getHidden);
			res.Key = this.relativeAbsoluteKeyService.getRelativePath(res.Key.replace(new RegExp("~", 'g'), "/"));
		}
		catch // If the object isn't locked, the getObjectFromTable will throw an "object not found" error. Return null to indicate this object isn't locked.
		{}

		return res;
	}

	//#endregion

	//#region IPfsMutator
	async lock(Key: any, transactionType: TransactionType)
	{
		console.log(`Attempting to lock key: ${Key}`);

		const item: any = 
						{
							Key : this.relativeAbsoluteKeyService.getAbsolutePath(Key).replace(new RegExp("/", 'g'), "~"),
							TransactionType : transactionType
						};

		const lockRes =  await this.pepperiDal.postDocumentToTable(LOCK_ADAL_TABLE_NAME, item);

		lockRes.Key = this.relativeAbsoluteKeyService.getRelativePath(item.Key.replace(new RegExp("~", 'g'), "/"));

		console.log(`Successfully locked key: ${lockRes.Key}`);

		return lockRes;
	}

	async setRollbackData(item: any) 
	{
		console.log(`Setting rollback data to key: ${item.Key}`);
		const itemCopy = {...item};

		itemCopy.Key = this.relativeAbsoluteKeyService.getAbsolutePath(item.Key).replace(new RegExp("/", 'g'), "~");

		const lockRes =  await this.pepperiDal.postDocumentToTable(LOCK_ADAL_TABLE_NAME, itemCopy);

		lockRes.Key = this.relativeAbsoluteKeyService.getRelativePath(itemCopy.Key.replace(new RegExp("~", 'g'), "/"));

		console.log(`Successfully set rollback data for key: ${lockRes.Key}`);

		return lockRes;
	}

	async mutateADAL(newFileFields: any, existingFile: any) 
	{
		return await this.uploadFileMetadata(newFileFields, existingFile);
	}

	async notify(newFileFields: any, existingFile: any)
	{
		//TODO implement.
	}
	
	async unlock(key: string)
	{
		const lockKey = this.relativeAbsoluteKeyService.getAbsolutePath(key).replace(new RegExp("/", 'g'), "~");

		console.log(`Attempting to unlock object: ${key}`);
		const res = await this.pepperiDal.hardDeleteDocumentFromTable(LOCK_ADAL_TABLE_NAME, lockKey);
		console.log(`Successfully unlocked object: ${key}`);
		return res;
	}


	//#endregion

	//#region private methods
    
	protected getRequestedPageNumber(): number
	{
		let res = parseInt(this.request.query.page);
		if(res === 0)
		{
			res++;
		}

		return res;
	}

	protected async uploadFileMetadata(newFileFields: any, existingFile: any): Promise<AddonData> 
	{
		newFileFields.Key = this.relativeAbsoluteKeyService.removeSlashPrefix(newFileFields.Key);
		newFileFields.Folder = this.relativeAbsoluteKeyService.removeSlashPrefix(newFileFields.Folder);
		// Set Urls
		await this.setUrls(newFileFields, existingFile);
		
		const presignedURL = newFileFields.PresignedURL;
		delete newFileFields.PresignedURL; //Don't store PresignedURL in ADAL


		const tableName = SharedHelper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);

		const res = await this.pepperiDal.postDocumentToTable(tableName, newFileFields);
		
		// Add back the PresignedURL
		res.PresignedURL = presignedURL;
		
		return res;
	}

	protected async setUrls(newFileFields: any, existingFile: any) 
	{

		if (!existingFile.doesFileExist) 
		{
			if (!newFileFields.Key.endsWith('/')) //Add URL if this isn't a folder and this file doesn't exist.
			{
				newFileFields.URL = encodeURI(`${CdnServers[this.environment]}/${this.relativeAbsoluteKeyService.getAbsolutePath(newFileFields.Key)}`);
			}
			else
			{
				newFileFields.URL = ``;
			}
		}
		if(newFileFields.Thumbnails)
		{
			newFileFields.Thumbnails.forEach(thumbnail => 
			{
				thumbnail.URL = encodeURI(`${CdnServers[this.environment]}/thumbnails/${this.relativeAbsoluteKeyService.getAbsolutePath(newFileFields.Key)}_${thumbnail.Size}`);
			});
		}
	}

	//#endregion
}
