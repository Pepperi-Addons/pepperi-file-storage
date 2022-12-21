import config from '../../addon.config.json';
import { AbstractS3PfsDal } from './AbstractS3PfsDal';
import { CdnServers, LOCK_ADAL_TABLE_NAME, SharedHelper, TransactionType } from 'pfs-shared';
import { AddonsDataSearchParams, AddonsDataSearchResult } from '@pepperi-addons/cpi-node/build/cpi-side/client-api';
import { AddonData } from '@pepperi-addons/papi-sdk';
import lodashPick from 'lodash.pick'

export class IndexedDataS3PfsDal extends AbstractS3PfsDal 
{    

	//#region IPfsGetter

	async getObjects(whereClause?: string): Promise<AddonsDataSearchResult>
	{
		const pfsTableName = SharedHelper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);

		// ModificationDateTime is always needed so we could add the version later on in the function.
		// The Fields filter will be enforced after the GET from the schema.
		const addonsDataSearch: AddonsDataSearchParams = {
			...(this.request.query?.where && {Where: this.request.query.where}),
			...(whereClause && {where: whereClause}), // If there's a where clause, use it instead 
			...(this.request.query?.page_size && {PageSize: parseInt(this.request.query.page_size)}),
			...(this.request.query?.page && {Page: this.getRequestedPageNumber()}),
			...(this.request.query?.order_by && {SortBy: this.request.query.order_by}),
			...(this.request.query?.include_count && {IncludeCount: this.request.query.include_count}),
		}

		const res = await pepperi.addons.data.uuid(config.AddonUUID).table(pfsTableName).search(addonsDataSearch);

		// Set v={{modificationDateTime}} on each URL to avoid browser cache.
		res.Objects = this.addVersionToObjectsUrl(res.Objects);

		// Handle downloading files to device if needed
		res.Objects = await this.downloadFilesToDevice(res.Objects);

		// Return only needed Fields
		// This must happen after we set the version, and after we download the files to the device.
		// Setting the version requires the ModificationDateTime field, and downloading the files
		// is based on the Sync field.
		res.Objects = this.pickRequestedFields(res.Objects, this.request.query?.fields);

		

		console.log(`Files listing done successfully.`);
		return res;
	}

	private addVersionToObjectsUrl(objects: AddonData[]): AddonData[] {
		const resObjects: AddonData[] = new Array<AddonData>();
		objects.map(object => {
			const objectCopy = {... object};
			objectCopy.URL = `${objectCopy.URL}?v=${objectCopy.ModificationDateTime}`;
		})

		return resObjects;
	}

	private pickRequestedFields(objects: AddonData[], fields: string): AddonData[] {

		if(!fields)
		{
			return objects;
		}

		const fieldsArray = fields.split(',');

		// For information about lodash.pick see: https://lodash.com/docs/2.4.2#pick
		const resObjects: AddonData[] = objects.map(object => lodashPick(object, fieldsArray));

		return resObjects;
	}

	/**
	 * Downloads the files to the device if needed ()
	 * @param objects 
	 * @returns 
	 */
	private async downloadFilesToDevice(objects: AddonData[]): Promise<AddonData[]> 
	{
		// If webapp, no need to download files to device.
		if(await global['app']['wApp']['isWebApp']())
		{
			return objects;
		}

		// Download to device only the needed files
		const resultObjects = objects.filter(object => object.Sync !== 'None' && object.Sync !== 'DeviceThumbnail' && object.MIME !== "pepperi/folder");

		for (const object of resultObjects)
		{
			// This forces a download to the device (if it exists)
			await global['app'].getLocalFilePath(object.URL.pathname, object.URL.origin);
			// Get the new baseURL (local root, instead of cdn), and concat the existing URL's pathname
			// Use URL.pathname instead of Key, since we now have the ModificationDateTime concatenated as a query param.
			object.URL = await pepperi["files"].baseURL() + object.URL.pathname;
		}

		return resultObjects;
	}

	private async getObjectFromTable(key, tableName, getHidden: boolean = false){
		console.log(`Attempting to download the following key from ADAL: ${key}, Table name: ${tableName}`);
		try 
		{
			// Use where clause, since the Keys include '/'s.
			const addonsDataSearchParams: AddonsDataSearchParams = {
				Where: `Key='${key}'`
			}

			const downloaded = await pepperi.addons.data.uuid(config.AddonUUID).table(tableName).search(addonsDataSearchParams);
			if(downloaded.Objects.length === 1)
			{
				console.log(`File Downloaded`);
				return downloaded.Objects[0];
			}
			else if(downloaded.Objects.length > 1)
			{
				console.error(`Internal error. Found more than one file with the given key. Where clause: ${addonsDataSearchParams.Where}`);
				
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
	async lock(Key: any, transactionType: TransactionType){
		console.log(`Attempting to lock key: ${Key}`);

		const item: any = 
						{
							Key : this.getAbsolutePath(Key).replace(new RegExp("/", 'g'), "~"),
							TransactionType : transactionType
						};

		const lockRes =  await pepperi.addons.data.uuid(config.AddonUUID).table(LOCK_ADAL_TABLE_NAME).upsert(item);

		lockRes.Key = this.getRelativePath(item.Key.replace(new RegExp("~", 'g'), "/"));

		console.log(`Successfully locked key: ${lockRes.Key}`);

		return lockRes;
	}

	async setRollbackData(item: any) {
		console.log(`Setting rollback data to key: ${item.Key}`);
		const itemCopy = {...item};

		itemCopy.Key = this.getAbsolutePath(item.Key).replace(new RegExp("/", 'g'), "~");

		const lockRes = await pepperi.addons.data.uuid(config.AddonUUID).table(LOCK_ADAL_TABLE_NAME).upsert(itemCopy);

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
		// const res = await pepperi.addons.data.uuid(config.AddonUUID).table(LOCK_ADAL_TABLE_NAME).key(lockKey).hardDelete(true);
		console.log(`Successfully unlocked object: ${key}`);
		// return res;
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


		const tableName = SharedHelper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);
        // res = await this.papiClient.addons.data.uuid(config.AddonUUID).table(tableName).upsert(newFileFields);
        res = await pepperi.addons.data.uuid(config.AddonUUID).table(tableName).upsert(newFileFields);
		
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