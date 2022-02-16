import { PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { dataURLRegex } from './constants';
import fetch from 'node-fetch';
import { IPfsDal } from './DAL/IPfsDal';

const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundently.

class PfsService 
{
	papiClient: PapiClient;
	DistributorUUID: string;
	AddonUUID: string;
	readonly environment: string;
	readonly MIME_FIELD_IS_MISSING = "Missing mandatory field 'MIME'";
	syncTypes = ["None", "Device", "DeviceThumbnail", "Always"];
	doesFileExist?: boolean = undefined;

	constructor(private client: Client, private request: Request, private dal: IPfsDal) 
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
			await this.validateAddonSecretKey();
			this.doesFileExist = await this.getDoesRequestedFileExist();
			this.validateFieldsForUpload();

			if(this.request.body.Key.endsWith('/')) 
			{ // if the key ends with '/' it means we are creating a folder 
				res = await this.createFolder();
			}
			else //file post
			{
				res = await this.postFile();
			}
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

	async uploadFileMetadata() 
	{
		const metadata = this.getMetadata();	
		const res = await this.dal.uploadFileMetadata(metadata, await this.getDoesFileExist());

		return res;
	}

	private async getDoesRequestedFileExist() 
	{
		if(this.doesFileExist != undefined)
		{
			return this.doesFileExist;
		}

		this.doesFileExist = await this.getDoesFileExist();
		return this.doesFileExist;
	}

	/**
	 * Returns wether or not a file exist. If fileKey is provided, returns whether it exists. Otherwise returns whther or not the Key in this.request exists.
	 */
	private async getDoesFileExist(fileKey?: string) 
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

	private async postFile() 
	{
		let res: any = {};

		if (this.request.body.URI)
		{
			const buffer: Buffer = await this.getFileDataBuffer();
			await this.dal.uploadFileData(this.request.body.Key, buffer);
		}
		else if(!this.request.body.URI && !this.doesFileExist)
		{ // in case "URI" is not provided on Creation (that is why the check if file exists) a PresignedURL will be returned 
			res["PresignedURL"] = await this.dal.generatePreSignedURL(this.request.body.Key); // creating presignedURL
		}

		res = {
			...res,
			...await this.uploadFileMetadata()
		};
		console.log(`File metadata successfuly uploaded to ADAL.`);

		return res;
	}

	private async getFileDataBuffer() 
	{
		let buf: Buffer;

		if (this.isDataURL(this.request.body.URI)) // dataURI get the base 64 part
		{ 
			buf = Buffer.from(this.request.body.URI.match(dataURLRegex)[4], 'base64');
		}
		else //the URI is URL - downalod the data
		{
			buf = await this.downloadFileBufferFromURL();
		}

		return buf;
	}

	private async downloadFileBufferFromURL() 
	{
		const respons = await fetch(this.request.body.URI, { method: `GET` });
		const arrayData = await respons.arrayBuffer();
		const buf = Buffer.from(arrayData);

		return buf;
	}

	private async createFolder() 
	{
		return await this.uploadFileMetadata();			
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
		else if(!this.doesFileExist && !this.request.body.MIME )
		{
			throw new Error(this.MIME_FIELD_IS_MISSING);
		}
		else if(!this.doesFileExist && this.request.body.MIME == 'pepperi/folder' && !this.request.body.Key.endsWith('/'))
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
		if (!this.request.header["X-Pepperi-SecretKey"] || !await this.isValidRequestedAddon(this.client, this.request.header["X-Pepperi-SecretKey"], this.AddonUUID)) 
		{

			const err: any = new Error(`Authorization request denied. ${this.request.header["X-Pepperi-SecretKey"]? "check secret key" : "Missing secret key header"} `);
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
		
		const metadata: any = {
			Key: this.request.body.Key
		};

		if(!this.doesFileExist)
		{
			metadata.Name = `${fileName}${this.request.body.Key.endsWith('/') ? '/' :''}`; // Add the dropped '/' for folders.
			metadata.Folder = containingFolder;
			metadata.MIME = this.getMimeType();
			metadata.Hidden = this.request.body.Hidden ?? false;

			if(!this.request.body.Key.endsWith('/')) // This is not a folder
			{
				metadata.Sync = this.request.body.Sync ?? this.syncTypes[0];
				metadata.Description = this.request.body.Description ?? "";
			}
			else //this is a folder
			{
				metadata.Sync = this.syncTypes[0];
				metadata.Description = "";
			}
			
		}
		else // The file does exist, there's no need to set Folder and Name fields
		{
			if(!this.request.body.Key.endsWith('/')) // This is not a folder
			{
				if(this.request.body.MIME) metadata.MIME = this.getMimeType();
				if(this.request.body.Sync) metadata.Sync = this.request.body.Sync;
				if(this.request.body.Description) metadata.Description = this.request.body.Description;
			}
			
			if(this.request.body.Hidden) metadata.Hidden = this.request.body.Hidden;
		}

		// TODO Remove this debug logic
		if(this.request.body.ExpirationDateTime){
			metadata.Hidden = this.request.body.Hidden ?? true
			metadata.ExpirationDateTime = this.request.body.ExpirationDateTime;

		}

		return metadata;
	}

	/**
	 * Download the file's metadata.
	 * @returns 
	 */
	async downloadFile(downloadKey? : string) 
	{
		const downloadKeyRes: string = downloadKey ?? ((this.request.body && this.request.body.Key) ? this.request.body.Key : this.request.query.Key); 
		return await this.dal.downloadFileMetadata(downloadKeyRes)
	}

	async listFiles()
	{
		try 
		{
			const requestedFolder = this.request.query.folder.endsWith('/') ? this.request.query.folder : this.request.query.folder + '/'; //handle trailing '/'

			const doesFolderExist = await this.getDoesFileExist(requestedFolder);
			if(!doesFolderExist && this.request.query.folder != '/') // The root folder is not created, and therefore isn't listed in the adal table. It is tere by default.
			{
				console.error(`Could not find requested folder: '${this.request.query.folder}'.`);

				const err: any = new Error(`Could not find requested folder: ${this.request.query.folder}`);
				err.code = 404;
				throw err;
			}

			return this.dal.listFolderContents(requestedFolder);
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

	async recordRemoved() {
		const removedKeys: [string] = this.request.body.Message.ModifiedObjects.map(modifiedObject => modifiedObject.ObjectKey);
		for(const removedKey of removedKeys){
			await this.dal.deleteFileData(removedKey);
		}
	}
}

export default PfsService;