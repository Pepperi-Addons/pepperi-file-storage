import { AddonData, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";
import lodashPick from "lodash.pick";
import URL from "url-parse";
import fs from "fs";
import path from "path";
import writeFile from "write-file-atomic";

import { PfsService } from "../cpiPfs.service";
import { IndexedDataS3PfsDal, SharedHelper } from "pfs-shared";

export class CpiIndexedDataS3PfsDal extends IndexedDataS3PfsDal 
{    

	//#region IPfsGetter

	override async getObjects(searchBody?: SearchBody): Promise<SearchData<AddonData>>
	{
		// ModificationDateTime is always needed so we could add the version later on in the function.
		// The Fields filter will be enforced after the GET from the schema.
		searchBody = searchBody ?? SharedHelper.constructSearchBodyFromRequest(this.request);
		if(searchBody.Fields)
		{
			delete searchBody.Fields;
		}

		const getPfsTableName = SharedHelper.getPfsTableName(this.request.query.addon_uuid, this.clientSchemaName);
		const resultObjects = await this.pepperiDal.searchDataInTable(getPfsTableName, searchBody!);

		// Set v={{modificationDateTime}} on each URL to avoid browser cache.
		resultObjects.Objects = this.addVersionToObjectsUrl(resultObjects.Objects);

		// Handle downloading files to device if needed
		await this.downloadFilesToDevice(resultObjects.Objects);

		// Return only needed Fields
		// This must happen after we set the version, and after we download the files to the device.
		// Setting the version requires the ModificationDateTime field, and downloading the files
		// is based on the Sync field.
		resultObjects.Objects = this.pickRequestedFields(resultObjects.Objects, this.request.query?.fields);

		resultObjects.Objects.map(object =>
		{
			// Delete the TemporaryFileURLs field, since it's not needed in the response.
			delete object.TemporaryFileURLs;
		});

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

		const fieldsArray = fields.split(",");

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
		if(await global["app"]["wApp"]["isWebApp"]())
		{
			return;
		}

		// Only download to device files that are supposed to be synced, have a URL, and are not already cached.
		const downloadRequiringObjects = objects.filter(object => object.Sync !== "None" &&
																	object.Sync !== "DeviceThumbnail" &&
																	object.URL &&
																	!PfsService.downloadedFileKeysToLocalUrl.has(`${object.Key!}${object.ModificationDateTime!}`));

		const downloadFiles = async (object: AddonData) =>
		{
			// Force a download to the device
			const objectUrl = new URL(object.URL);
			await global["app"].getLocalFilePath(objectUrl.pathname, objectUrl.origin);
			// Get the new baseURL (local root, instead of cdn), and concat the existing URL's pathname
			// Use URL.pathname instead of Key, since we now have the ModificationDateTime concatenated as a query param.
			const objectLocalURL = encodeURI(await pepperi["files"].baseURL() + objectUrl.pathname + objectUrl.query);

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
		// Save the file to the PFS table.
		const superRes = await super.uploadFileMetadata(newFileFields, existingFile);

		// Cache the result, so we won't have to download the file again.
		const localURL = `${await pepperi.files.baseURL()}/${this.relativeAbsoluteKeyService.getAbsolutePath(newFileFields.Key)}`;
		PfsService.downloadedFileKeysToLocalUrl.set(`${superRes.Key!}${superRes.ModificationDateTime!}`, localURL);

		// If this file has already been POSTed to the PFS table, has been uploaded, but not yet Synced,
		// it will have a TemporaryFileURLs field. Since it is not needed in the response, delete it.
		delete superRes.TemporaryFileURLs; 

		// Set the URL to point to the local file.
		superRes.URL = localURL;

		return superRes;
	}

	public override async mutateS3(newFileFields: any, existingFile: any): Promise<void> 
	{
		const canonizedKey = this.relativeAbsoluteKeyService.removeSlashPrefix(newFileFields.Key);

		// Save dataUri to local file
		const localFilePath = `${await pepperi.files.rootDir()}/${this.relativeAbsoluteKeyService.getAbsolutePath(canonizedKey)}`;
		await this.locallySaveBase64ToFile(newFileFields.buffer, localFilePath);

		delete newFileFields.buffer;
		
		console.log(`mutateS3: Successfully saved file "${canonizedKey}" to the device.`);
	}

	/**
	 * Write the buffer to the file path. Creates any missing folders in the path.
	 * @param {Buffer} buffer the buffer to write to the file
	 * @param {string} filePath the path to write the file to
	 */
	public async locallySaveBase64ToFile(buffer: Buffer, filePath: string): Promise<void> 
	{
		const dir = path.dirname(filePath);

		// Create any missing directories in the file path
		await fs.promises.mkdir(dir, { recursive: true });

		// // Atomically write the file to the path
		// // This function writes the file to a temporary file, and then renames it to the correct file name (the rename is atomic).
		// // That way we can read a previous version of the file even while it's being written to.
		// // For more details see: https://www.npmjs.com/package/write-file-atomic
		// await writeFile(filePath, buffer);

		// Write the file to the path
		await fs.promises.writeFile(filePath, buffer);
	}
}
