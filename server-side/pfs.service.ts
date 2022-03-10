import { PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { dataURLRegex, MAXIMAL_LOCK_TIME } from './constants';
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
	}

	async uploadFile(): Promise<boolean> 
	{
		let res:any = {};

		try 
		{
			await this.validateUploadRequest();

			await this.lock();

			await this.getCurrentItemData();

			this.validateFieldsForUpload();
			
			await this.pfsMutator.setRollbackData(this.existingFile);

			res = await this.mutatePfs();

			await this.pfsMutator.notify(this.newFileFields, this.existingFile);

			await this.pfsMutator.unlock(this.existingFile.Key);

			await this.pfsMutator.invalidateCDN(this.existingFile.Key);

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
		}
	}

	private async validateUploadRequest() 
	{
		await this.validateAddonSecretKey();

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
			if (timePassedSinceLock > MAXIMAL_LOCK_TIME) 
			{
				this.rollback(lockedFile);
			}

			else 
			{
				const err: any = new Error(`The requested key ${this.request.body.Key} is currently locked for ${timePassedSinceLock} ms, which is less then the maixmal ${MAXIMAL_LOCK_TIME} ms. To allow the current transaction to finish executing, please try again later.`);
				err.code = 409; // Conflict code. This response is sent when a request conflicts with the current state of the server.
				throw err;
			}
		}

		await this.pfsMutator.lock(this.request.body.Key);
	}

	private rollback(lockedFile: any) 
	{
		throw new Error('Method not implemented.');
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

	private validateFieldsForUpload() 
	{
		if (!this.request.body.Key) 
		{
			throw new Error("Missing mandatory field 'Key'");
		}
		else if(!this.existingFile.doesFileExist && !this.request.body.MIME )
		{
			throw new Error(this.MIME_FIELD_IS_MISSING);
		}
		else if(!this.existingFile.doesFileExist && this.request.body.MIME == 'pepperi/folder' && !this.request.body.Key.endsWith('/'))
		{
			// if 'pepperi/folder' is provided on creation and the key is not ending with '/', the POST should fail
			throw new Error("On creation of a folder, the key must end with '/'");
		}
		else if(this.request.body.MIME != 'pepperi/folder' && this.request.body.Key.endsWith('/'))
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
			MIME = this.request.body.URI.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
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
