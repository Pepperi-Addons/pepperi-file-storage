import { PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { dataURLRegex } from './constants';
import fetch from 'node-fetch';
import { ImageResizer } from './imageResizer';
import { IPfsMutator } from './DAL/IPfsMutator';
import { IPfsGetter } from './DAL/IPfsGetter';

export class PfsService 
{
	papiClient: PapiClient;
	DistributorUUID: string;
	AddonUUID: string;
	readonly environment: string;
	readonly MIME_FIELD_IS_MISSING = "Missing mandatory field 'MIME'";
	syncTypes = ["None", "Device", "DeviceThumbnail", "Always"];
	existingFile: any;
	newFileFields: any = {};

	constructor(private client: Client, private request: Request, private pfsMutator: IPfsMutator, private pfsGetter: IPfsGetter ) 
	{
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			addonSecretKey: client.AddonSecretKey,
			actionUUID: client.AddonUUID
		});
				 
		this.environment = jwtDecode(client.OAuthAccessToken)['pepperi.datacenter'];
		this.DistributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];
		this.AddonUUID = this.request.query.addon_uuid;

		if(this.request.body && typeof this.request.body.Hidden === 'string')
		{
			this.request.body.Hidden = this.request.body.Hidden.toLowerCase() === 'true';
		}
	}

	async uploadFile(): Promise<boolean> 
	{
		let res:any = {};

		try 
		{
			// Validate preliminary request requirements
			await this.validateUploadRequest();

			// Set preliminary lock on the file. If necessary, this will also rollback an existing lock
			await this.lock();

			// Download the current saved metadata, if exists
			await this.getCurrentItemData();

			// Further validation of input
			await this.validateFieldsForUpload();
			
			// Save the currently saved metadata on the lock - will be used for rollback purposes
			await this.pfsMutator.setRollbackData(this.existingFile);

			// Commit changes to S3 and ADAL metadata table
			res = await this.mutatePfs();

			// Publish notification to subscribers
			await this.pfsMutator.notify(this.newFileFields, this.existingFile);

			// Remove lock
			await this.pfsMutator.unlock(this.existingFile.Key);

			// Invalidate CDN server (including thumbnails if exist)
			await this.pfsMutator.invalidateCDN(this.existingFile);

		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`Could not upload file ${this.request.body.Key}. ${err.message}`);
			}
			throw err;
		}

		return res;
	}

	private async getCurrentItemData() 
	{
		try 
		{
			this.existingFile = await this.downloadFile();
			this.existingFile.doesFileExist = true;
		}
		catch 
		{
			this.existingFile = {};
			this.existingFile.doesFileExist = false;
			this.existingFile.Key = this.request.body.Key;
			this.existingFile.Hidden = false;
		}
	}

	private async validateUploadRequest() 
	{
		await this.validateAddonSecretKey();

		if (!this.request.body.Key) 
		{
			throw new Error("Missing mandatory field 'Key'");
		}
		
		if (this.request.body.Thumbnails) 
		{
			this.validateThumbnailsRequest(this.request.body.Thumbnails);
		}
	}

	private async mutatePfs() 
	{
		let res: any = {};

		if (this.request.body.Key.endsWith('/')) 
		{ // if the key ends with '/' it means we are creating a folder 
			res = await this.createFolder();
		}
		else //file post
		{
			res = await this.createFile();
		}
		return res;
	}

	private async lock() 
	{
		const lockedFile = await this.pfsMutator.isObjectLocked(this.request.body.Key);
		const timePassedSinceLock = lockedFile ? (new Date().getTime()) - (new Date(lockedFile.CreationDateTime)).getTime() : (new Date().getTime());

		if (lockedFile) 
		{
			if (timePassedSinceLock > this.pfsMutator.getMaximalLockTime()) 
			{
				await this.rollback(lockedFile);
			}

			else 
			{
				const err: any = new Error(`The requested key ${this.request.body.Key} is currently locked for ${timePassedSinceLock} ms, which is less then the maixmal ${this.pfsMutator.getMaximalLockTime()} ms. To allow the current transaction to finish executing, please try again later.`);
				err.code = 409; // Conflict code. This response is sent when a request conflicts with the current state of the server.
				throw err;
			}
		}

		await this.pfsMutator.lock(this.request.body.Key);
	}

	private async rollback(lockedFile: any) 
	{
		console.error(`Rollback algorithm invoked for key: ${lockedFile.Key}`);

		await this.getCurrentItemData();
		console.log("Trying to determine where the transaction failed...");
		if(this.existingFile.doesFileExist && !this.areExistingAndLockedFileSame(lockedFile)) 
		// Changes have already been committed to (S3, if there were changes to the file's data and to) the metadata table. 
		// The transaction can be completed. Since there's no way of telling whether a notification has already been sent or not,
		// A notification will be sent anyway (PNS philosophy is "Notify at least once").
		{
			//Now the metadata table holds the updated data, and the lock table holds the outdated data.
			console.log("Changes have already been committed to the metadata table (and S3, if they were needed). The transaction can be completed. Notifying subscribers...");
			await this.pfsMutator.notify(this.existingFile, lockedFile);
		}
		else
		{
			console.log("No changes were committed to the metadata table. Checking if S3 has been updated...");
			const s3FileVersion = await this.pfsGetter.getObjectS3FileVersion(this.existingFile.Key);
			if (s3FileVersion != this.existingFile.FileVersion) //We have to get the file version from S3 since S3 has been updated, but the metadata table hasn't.
			// A change has been made to S3, but was not yet applied to ADAL. At this stage there's not enough data to complete
			// the transaction, so a rollback is needed. Permanently delete the newer S3 version, to revert the latest version to the previous one.
			{	
				console.log(`Changes have been committed to S3 (S3's VersionId = ${s3FileVersion}, metadata FileVersion = ${this.existingFile.FileVersion}). Reverting S3 to previous version (if exists. Otherwise delete S3 object.)`);
				await this.pfsMutator.deleteS3FileVersion(this.existingFile.Key, s3FileVersion);
				console.log("Done reverting S3 to previous state.");

			}	
			else
			{
				console.log("No changes have been committed to S3 either.");
			}
		} 

		console.log("Unlocking file...");
		await this.pfsMutator.unlock(lockedFile.Key);
		console.log("Done unlocking the file.");

		console.error(`Rollback algorithm has finished running for key: ${lockedFile.Key}`);

		await this.pfsMutator.invalidateCDN(lockedFile);

		if(this.request.query.testRollback) // If testing rollback, throw exception to stop the process after rollback.
		{
			throw new Error("Testing rollback - finishing execution after rollback was done.");
		}

	}

	private areExistingAndLockedFileSame(lockedFile: any) 
	{
		console.log("Comparing locked object data and the stored metadata...");

		const files = [{...lockedFile}, {...this.existingFile}];

		for(const file of files)
		{
			delete file.ModificationDateTime
			delete file.CreationDateTime
			delete file.doesFileExist;
		}

		files[1].Key = files[1].Key.startsWith('/') ? files[1].Key.substring(1) : files[1].Key

		const res = shallowCompareObjects();

		console.log(`Comparison results - lockeFile === storedFile: ${res}`);

		return res;

		function shallowCompareObjects() 
		{
			return Object.keys(files[0]).length === Object.keys(files[1]).length &&
				Object.keys(files[0]).every(key => files[1].hasOwnProperty(key) && files[0][key] === files[1][key]
				);
		}
	}

	/**
	 * Returns wether or not a file exist.
	 */
	private async getDoesFileExist(fileKey: string) 
	{
		let file: any = null;

		try 
		{
			file = await this.downloadFile(fileKey);
		}
		catch (e) 
		{ 
			if (e instanceof Error) 
			{
				console.log(e.message);
			}
		}

		const res = !!file;

		return res;
	}

	private async createFile() 
	{
		let res: any = {};

		this.getMetadata();
		if(this.request.body.URI)
		{
			this.newFileFields.buffer = await this.getFileDataBuffer(this.request.body.URI);
		}
		const shouldCreateThumbnails = (this.request.body.Thumbnails && this.request.body.Thumbnails.length > 0) ||  (this.existingFile.Thumbnails && this.request.body.URI); //The user asked for thumbnails, or the file already has thumbnails, and the file data is updated.
		if (shouldCreateThumbnails)
		{
			const buffer = this.newFileFields.buffer ?? await this.getFileDataBuffer(this.existingFile.URL);
			const MIME = this.newFileFields.MIME ?? this.existingFile.MIME;

			if(!this.newFileFields.buffer)
			{
				this.existingFile.buffer = buffer;
			}

			await this.createThumbnailsBuffers(buffer, MIME);
		}
		
		await this.pfsMutator.mutateS3(this.newFileFields, this.existingFile)
		res = await this.pfsMutator.mutateADAL(this.newFileFields, this.existingFile);

		console.log(`Successfuly created a file.`);


		return res;
	}

	private async createThumbnailsBuffers(buffer: Buffer, MIME: string) 
	{
		const resizer = new ImageResizer(MIME, buffer);
		const thumbnails = this.newFileFields.Thumbnails ?? this.existingFile.Thumbnails;

		this.newFileFields.Thumbnails = await Promise.all(thumbnails.map(async thumbnail => 
		{
			return {
				buffer: await resizer.resize(thumbnail),
				Size: thumbnail.Size
			};
		}));
	}

	private validateThumbnailsRequest(thumbnails: any) 
	{
		if (thumbnails.length > 1) //Currently, only a single '200x200' thumbnail is supported.
		{
			const err: any = new Error(`A maximum of a single thumbnail is supported.`);
			err.code = 400;
			throw err;
		}

		const validThumbnailsSizes = thumbnails.every(thumbnail => thumbnail.Size.toLowerCase() === '200x200');
		if (!validThumbnailsSizes) //Currently, only a single '200x200' thumbnail is supported.
		{
			const err: any = new Error(`Size of thumbnail should be '200x200'.`);
			err.code = 400;
			throw err;
		}
	}

	private async getFileDataBuffer(url) 
	{
		let buf: Buffer;

		if (this.isDataURL(url)) // dataURI get the base 64 part
		{ 
			buf = Buffer.from(url.match(dataURLRegex)[4], 'base64');
		}
		else //the URI is URL - downalod the data
		{
			buf = await this.downloadFileBufferFromURL(url);
		}

		return buf;
	}

	private async downloadFileBufferFromURL(url) 
	{
		const respons = await fetch(url, { method: `GET` });
		const arrayData = await respons.arrayBuffer();
		const buf = Buffer.from(arrayData);

		return buf;
	}

	private async createFolder() 
	{
		this.getMetadata();	
		return await this.pfsMutator.mutateADAL(this.newFileFields, this.existingFile);
	}
		
	isDataURL(s) 
	{
		return !!s.match(dataURLRegex);
	}

	private async validateFieldsForUpload() 
	{

		this.validateMIMEtype();

		if(this.request.body.Key.endsWith('/') && this.request.body.Hidden) // If trying to delete a folder
		{
			await this.validateNoContentsBeforeFolderDeletion();
		}
		
	}

	private async validateNoContentsBeforeFolderDeletion() 
	{
		const folderContents = await this.pfsGetter.listFolderContents(this.request.body.Key);
		if (folderContents.length > 0) // Currently deleting folder that has exisitng content is not supported.
		{
			const err: any = new Error(`Bad request. Folder content must be deleted before the deletion of the folder.`);
			err.code = 400;
			console.log(err.message);
			throw err;
		}
	}

	private validateMIMEtype() 
	{
		if (!this.existingFile.doesFileExist && !this.request.body.MIME && !this.isDataURL(this.request.body.URI)) 
		{
			 // this is a presigned url request, or a URL link to data, MIME must be sent.
			throw new Error(this.MIME_FIELD_IS_MISSING);
		}
		else if (!this.existingFile.doesFileExist && this.request.body.MIME == 'pepperi/folder' && !this.request.body.Key.endsWith('/')) 
		{
			// if 'pepperi/folder' is provided on creation and the key is not ending with '/', the POST should fail
			throw new Error("On creation of a folder, the key must end with '/'");
		}
		else if (this.request.body.MIME && this.request.body.MIME != 'pepperi/folder' && this.request.body.Key.endsWith('/')) 
		{
			// a folder's MIME type should always be 'pepperi/folder', otherwise the POST should fail
			throw new Error("A filename cannot contain a '/'.");
		}
	}

	private async validateAddonSecretKey() 
	{
		
		for (const [key, value] of Object.entries(this.request.header)) 
		{
			this.request.header[key.toLowerCase()] = value;
		}

		if (!this.request.header["x-pepperi-secretkey"] || !await this.isValidRequestedAddon(this.client, this.request.header["x-pepperi-secretkey"], this.AddonUUID)) 
		{
			const err: any = new Error(`Authorization request denied. ${this.request.header["x-pepperi-secretkey"]? "check secret key" : "Missing secret key header"} `);
			err.code = 401;
			throw err;
		}
	}

	private async  isValidRequestedAddon(client: Client, secretKey, addonUUID)
	{
		const papiClient = new PapiClient({
		  baseURL: client.BaseURL,
		  token: client.OAuthAccessToken,
		  addonUUID: addonUUID,
		  actionUUID: client.ActionUUID,
		  addonSecretKey: secretKey
		});

		try
		{
			const res = await papiClient.get(`/var/sk/addons/${addonUUID}/validate`);
			return true;
		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`${err.message}`);
			}
			return false;
		}
	}

	private getMimeType(): string 
	{
		let MIME = this.request.body.MIME;
		
		if(this.request.body.URI && this.isDataURL(this.request.body.URI))
		{
			// Get mime type from base64 data
			const parsedMIME = this.request.body.URI.match(/[^:\s*]\w+\/[\w-+\d.]+(?=[;| ])/)[0];

			// If MIME type was passed, it must be the same as the one parsed from the data URI.
			// (Otherwise use the parsed MIME from the data URI)
			if(MIME && MIME != parsedMIME)
			{
				const err: any = new Error(`There's a discrepancy between the passed MIME type and the parsed one from the data URI.`);
				err.code = 400;
				throw err;
			}
			
			MIME = parsedMIME;
		}

		return MIME;
	}

	/**
	 * Returns a Metadata object representing the needed metadata.
	 * @returns a dictionary representation of the metadata.
	 */
	protected getMetadata()
	{

		const pathFoldersList = this.request.body.Key.split('/');
		if (this.request.body.Key.endsWith('/'))  //This is a new folder being created. We need to pop the trailing '' after splitting.
		{
			pathFoldersList.pop();
		}
		const fileName = pathFoldersList.pop();
		const containingFolder = pathFoldersList.join('/');

		this.newFileFields.Key = this.request.body.Key;

		if(!this.existingFile.doesFileExist)
		{
			this.newFileFields.Name = `${fileName}${this.request.body.Key.endsWith('/') ? '/' :''}`; // Add the dropped '/' for folders.
			this.newFileFields.Folder = containingFolder;
			this.newFileFields.MIME = this.getMimeType();
			this.newFileFields.Hidden = this.request.body.Hidden ?? false;

			if(!this.request.body.Key.endsWith('/')) // This is not a folder
			{
				this.newFileFields.Sync = this.request.body.Sync ?? this.syncTypes[0];
				this.newFileFields.Description = this.request.body.Description ?? "";
			}
			else //this is a folder
			{
				this.newFileFields.Sync = this.syncTypes[0];
				this.newFileFields.Description = "";
			}
			
		}
		else // The file does exist, there's no need to set Folder and Name fields
		{
			if(!this.request.body.Key.endsWith('/')) // This is not a folder
			{
				if(this.request.body.MIME) this.newFileFields.MIME = this.getMimeType();
				if(this.request.body.Sync) this.newFileFields.Sync = this.request.body.Sync;
				if(this.request.body.Description) this.newFileFields.Description = this.request.body.Description;
			}
			
			if(this.request.body.Hidden) this.newFileFields.Hidden = this.request.body.Hidden;
		}

		if(this.request.body.Thumbnails && Array.isArray(this.request.body.Thumbnails))
		{
			this.newFileFields.Thumbnails = this.request.body.Thumbnails.map(thumbnailRequest => 
			{
				return {Size: thumbnailRequest.Size.toLowerCase()}
			});
		}
	}

	/**
	 * Download the file's metadata.
	 * @returns 
	 */
	async downloadFile(downloadKey? : string) 
	{
		const downloadKeyRes: string = downloadKey ?? ((this.request.body && this.request.body.Key) ? this.request.body.Key : this.request.query.Key); 
		return await this.pfsGetter.downloadFileMetadata(downloadKeyRes)
	}

	async listFiles()
	{
		try 
		{
			const requestedFolder = this.request.query.folder.endsWith('/') ? this.request.query.folder : this.request.query.folder + '/'; //handle trailing '/'

			if(this.request.query.folder != '/' && !(await this.getDoesFileExist(requestedFolder))) // The root folder is not created, and therefore isn't listed in the adal table. It is there by default.
			{
				console.error(`Could not find requested folder: '${this.request.query.folder}'.`);

				const err: any = new Error(`Could not find requested folder: ${this.request.query.folder}`);
				err.code = 404;
				throw err;
			}

			return this.pfsGetter.listFolderContents(requestedFolder);
		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`Could not list files in folder ${this.request.query.folder}. ${err.message}`);
				throw err;
			}
		}
	}

	async recordRemoved() 
	{
		const removedKeys: [string] = this.request.body.Message.ModifiedObjects.map(modifiedObject => modifiedObject.ObjectKey);
		for(const removedKey of removedKeys)
		{
			await this.pfsMutator.mutateS3(null, {Key: removedKey, isFileExpired: true});
		}
	}
}

export default PfsService;
