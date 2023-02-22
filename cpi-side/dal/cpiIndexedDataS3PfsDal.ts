import { IndexedDataS3PfsDal, SharedHelper } from 'pfs-shared';
import { AddonData, FindOptions } from '@pepperi-addons/papi-sdk';
import lodashPick from 'lodash.pick';
import { URL } from 'url';
import { PfsService } from '../cpiPfs.service';
import fs from 'fs';
import path from 'path';

export class CpiIndexedDataS3PfsDal extends IndexedDataS3PfsDal 
{    

	//#region IPfsGetter

	override async getObjects(whereClause?: string): Promise<AddonData[]>
	{
		// ModificationDateTime is always needed so we could add the version later on in the function.
		// The Fields filter will be enforced after the GET from the schema.
		const findOptions: FindOptions = {
			...(this.request.query && this.request.query.where && {where: this.request.query.where}),
			...(whereClause && {where: whereClause}), // If there's a where clause, use it instead 
			...(this.request.query && this.request.query.page_size && {page_size: parseInt(this.request.query.page_size)}),
			...(this.request.query && this.request.query.page && {page: this.getRequestedPageNumber()}),
			...(this.request.query && this.request.query.order_by && {order_by: this.request.query.order_by}),
			...(this.request.query && this.request.query.include_count && {include_count: this.request.query.include_count}),
			...(this.request.query && this.request.query.include_deleted && {include_deleted: this.request.query.include_deleted}),
		};

		const getPfsTableName = SharedHelper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);
		let resultObjects =  await this.pepperiDal.getDataFromTable(getPfsTableName, findOptions);

		// Set v={{modificationDateTime}} on each URL to avoid browser cache.
		resultObjects = this.addVersionToObjectsUrl(resultObjects);

		// Handle downloading files to device if needed
		await this.downloadFilesToDevice(resultObjects);

		// Return only needed Fields
		// This must happen after we set the version, and after we download the files to the device.
		// Setting the version requires the ModificationDateTime field, and downloading the files
		// is based on the Sync field.
		resultObjects = this.pickRequestedFields(resultObjects, this.request.query?.fields);

		console.log(`Files listing done successfully.`);
		return resultObjects;
	}

	private addVersionToObjectsUrl(objects: AddonData[]): AddonData[] 
	{
		const resObjects: AddonData[] = new Array<AddonData>();
		objects.map(object => 
		{
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
		});

		return resObjects;
	}

	private pickRequestedFields(objects: AddonData[], fields: string): AddonData[] 
	{

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
		};
		
		const downloadFilesPromises = downloadRequiringObjects.map(file => downloadFiles(file));
		// Use allSettled to download files in parallel.
		await Promise.allSettled(downloadFilesPromises);

		// Update the objects' URL if they have a cached local URL.
		objects.map(object => 
		{
			object.URL = PfsService.downloadedFileKeysToLocalUrl.get(`${object.Key!}${object.ModificationDateTime!}`) ?? object.URL;
		});

		return;
	}

	protected override async uploadFileMetadata(newFileFields: any, existingFile: any): Promise<AddonData> 
	{
		const superRes = await super.uploadFileMetadata(newFileFields, existingFile);

		PfsService.downloadedFileKeysToLocalUrl.set(`${superRes.Key!}${superRes.ModificationDateTime!}`, superRes.URL!);
		delete superRes.PresignedURL; 
		return superRes;
	}

	protected override async setUrls(newFileFields: any, existingFile: any): Promise<void>
	{
		// If it's a file - set URL to to point to the local file.
		if(!newFileFields.Key.endsWith('/'))
		{
			newFileFields.URL = `${await pepperi.files.baseURL()}/${this.getAbsolutePath(newFileFields.Key)}`;
		}
	}

	public override async mutateS3(newFileFields: any, existingFile: any): Promise<void> 
	{
		const canonizedKey = this.removeSlashPrefix(newFileFields.Key);

		// Save dataUri to local file
		const localFilePath = `${await pepperi.files.rootDir()}/${this.getAbsolutePath(canonizedKey)}`;
		await this.locallySaveBase64ToFile(newFileFields.buffer, localFilePath);

		delete newFileFields.buffer;
		delete newFileFields.IsTempFile;
	}

	public async locallySaveBase64ToFile(buffer: Buffer, filePath: string): Promise<void> 
	{
		const dir = path.dirname(filePath);

		// Create any missing directories in the file path
		await fs.promises.mkdir(dir, { recursive: true });

		// Write the file to the path
		await fs.promises.writeFile(filePath, buffer);
	}
}
