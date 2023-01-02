import config from '../../addon.config.json';
import { AbstractS3PfsDal } from './AbstractS3PfsDal';
import { SharedHelper } from 'pfs-shared';
import { AddonsDataSearchParams } from '@pepperi-addons/cpi-node/build/cpi-side/client-api';
import { AddonData } from '@pepperi-addons/papi-sdk';
import lodashPick from 'lodash.pick'
import { URL } from 'url';
import PfsService from '../pfs.service';

export class IndexedDataS3PfsDal extends AbstractS3PfsDal 
{    
	//#region IPfsGetter

	async getObjects(whereClause?: string): Promise<AddonData[]>
	{
		const pfsTableName = SharedHelper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);

		// ModificationDateTime is always needed so we could add the version later on in the function.
		// The Fields filter will be enforced after the GET from the schema.
		const addonsDataSearch: AddonsDataSearchParams = {
			...(this.request.query?.where && {Where: this.request.query.where}),
			...(whereClause && {Where: whereClause}), // If there's a where clause, use it instead 
			...(this.request.query?.page_size && {PageSize: parseInt(this.request.query.page_size)}),
			...(this.request.query?.page && {Page: this.getRequestedPageNumber()}),
			...(this.request.query?.order_by && {SortBy: this.request.query.order_by}),
			...(this.request.query?.include_count && {IncludeCount: this.request.query.include_count}),
		}

		const res = await pepperi.addons.data.uuid(config.AddonUUID).table(pfsTableName).search(addonsDataSearch);

		// Set v={{modificationDateTime}} on each URL to avoid browser cache.
		res.Objects = this.addVersionToObjectsUrl(res.Objects);

		// Handle downloading files to device if needed
		await this.downloadFilesToDevice(res.Objects);

		// Return only needed Fields
		// This must happen after we set the version, and after we download the files to the device.
		// Setting the version requires the ModificationDateTime field, and downloading the files
		// is based on the Sync field.
		res.Objects = this.pickRequestedFields(res.Objects, this.request.query?.fields);

		console.log(`Files listing done successfully.`);
		return res.Objects;
	}

	/**
     * Returns the lock data if the key is locked, null otherwise.
     * @param relativeKey the key to check.
     */
	async isObjectLocked(key: string){
		throw new Error('Not implemented in CPI side.');
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

	private addVersionToObjectsUrl(objects: AddonData[]): AddonData[] {
		const resObjects: AddonData[] = new Array<AddonData>();
		objects.map(object => {
			let resObject: any;
			
			// Folder do not have a URL, so there's no need to concatenate anything...
			if(object.URL)
			{
				resObject = {... object};
				const modificationDateNumber = new Date(resObject.ModificationDateTime!).getTime();
			
				resObject.URL = `${resObject.URL}?v=${modificationDateNumber}`;
			}
			else
			{
				resObject = object;
			}

			resObjects.push(resObject);
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
	 * Downloads the files to the device if needed, and update URLs to point to the local files for downloaded files.
	 * @param objects 
	 * @returns 
	 */
	private async downloadFilesToDevice(objects: AddonData[]): Promise<void> 
	{
		// If webapp, no need to download files to device.
		if(await global['app']['wApp']['isWebApp']())
		{
			return;
		}

		// Only download to device files that are supposed to be synced, have a URL, and are not already cached.
		const downloadRequiringObjects = objects.filter(object => object.Sync !== 'None' &&
																	object.Sync !== 'DeviceThumbnail' &&
																	object.URL &&
																	!PfsService.downloadedFileKeysToLocalUrl.has(`${object.Key!}${object.ModificationDateTime!}`));

		const downloadFiles = async (object: AddonData) =>
		{
			// Force a download to the device
			const objectUrl = new URL(object.URL);
			await global['app'].getLocalFilePath(objectUrl.pathname, objectUrl.origin);
			// Get the new baseURL (local root, instead of cdn), and concat the existing URL's pathname
			// Use URL.pathname instead of Key, since we now have the ModificationDateTime concatenated as a query param.
			const objectLocalURL = await pepperi["files"].baseURL() + objectUrl.pathname + objectUrl.search;

			// Cache the result, so we won't have to download the file again.
			PfsService.downloadedFileKeysToLocalUrl.set(`${object.Key!}${object.ModificationDateTime!}`, objectLocalURL);
		}
		
		const downloadFilesPromises = downloadRequiringObjects.map(file => downloadFiles(file));
		// Use allSettled to download files in parallel.
		await Promise.allSettled(downloadFilesPromises);

		// Update the objects' URL if they have a cached local URL.
		objects.map(object => {
			object.URL = PfsService.downloadedFileKeysToLocalUrl.get(`${object.Key!}${object.ModificationDateTime!}`) ?? object.URL;
		});

		return;
	}

	//#endregion
}
