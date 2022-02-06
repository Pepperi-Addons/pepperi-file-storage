import { FindOptions, PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { dataURLRegex, S3Buckets, IPfsDal } from './constants';
import fetch from 'node-fetch';
import config from '../addon.config.json';

const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundently.

class PfsService 
{
	papiClient: PapiClient;
	s3: any;
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


		// const accessKeyId=""
		// const secretAccessKey=""
		// const sessionToken=""
		// AWS.config.update({
		// 	accessKeyId,
		// 	secretAccessKey,
		// 	sessionToken
		// });
				 

		this.environment = jwtDecode(client.OAuthAccessToken)['pepperi.datacenter'];
		this.DistributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];
		this.AddonUUID = this.request.query.addon_uuid;
		this.s3 = new AWS.S3();
	}

	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. An absolute path is a path that includes the Distributor's UUID, 
	 * the Addon's UUID and the trailing requested path.
	 * @param relativePath the path relative to the addon's folder
	 * @returns a string in the format ${this.DistributorUUID}/${this.AddonUUID}/${relativePath}
	 */
	private getAbsolutePath(relativePath: string): string 
	{
		if(relativePath.startsWith('/'))
			relativePath = relativePath.slice(1);

		return `${this.DistributorUUID}/${this.AddonUUID}/${relativePath}`;
	}

	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. A relative path is a path that's relative to the addon's folder.
	 * @param absolutePath the original path the addon requested
	 * @returns a relative path string
	 */
	private getRelativePath(absolutePath: string): string 
	{
		const relativePath = absolutePath.split(`${this.DistributorUUID}/${this.AddonUUID}/`)[1]
		const res = relativePath === '' ? '/' : relativePath; // Handle root folder case
		return res;
	}

	async uploadFile(): Promise<boolean> 
	{
		let res:any = {};
		try 
		{
			this.doesFileExist = await this.getDoesFileExist();
			await this.validateAddonSecretKey();
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

	private async getDoesFileExist() 
	{
		if(this.doesFileExist != undefined)
		{
			return this.doesFileExist;
		}
		
		let file: any = null;

		try 
		{
			file = await this.downloadFile();
		}
		catch (e) 
		{ 
			if (e instanceof Error) 
			{
				console.log(e.message);
			}
		}

		this.doesFileExist = !!file;
		return this.doesFileExist;
	}

	private async postFile() 
	{
		let res: any = {};

		const setPresignedURL = false;
		
		// Using ADAL, I think this IF is now redundant. Metdata can be uploaded whether or not data is uploaded to S3.
		// if(!this.doesFileExist && !this.request.body.URI)
		// {
		// 	 // in case "URI" is not provided on Creation (that is why the check if file exists) a PresignedURL will be returned 
		// 	 this.request.body.URI = `data:${this.request.body.MIME};base64,`; // creating an empty file to set all the metadata
		// 	 setPresignedURL = true;
		// }
		if (this.request.body.URI)
		{
			await this.uploadFileData();
		}

		res = await this.uploadFileMetadata();
		console.log(`File metadata successfuly uploaded to ADAL.`);

		if(setPresignedURL)
			res["PresignedURL"] = await this.generatePreSignedURL(this.getAbsolutePath(this.request.body.Key)); // creating presignedURL

		return res;
	}

	private async uploadFileData() 
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

		await this.dal.uploadFileData(this.request.body.Key, buf);
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

	async generatePreSignedURL(entryName)
	{
		const params =  {
			Bucket: S3Buckets[this.environment],
			Key: entryName,
		};
		let urlString = "";

		const date = new Date();
		params["Expires"] = 24*60*60;
			
		urlString = await  this.s3.getSignedUrl('putObject',params);
		return urlString;
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
		
		const metadata = {
			Key: this.request.body.Key,
			...(!this.doesFileExist && {// These fields are static, and are derived from the files's Key, which is immutable.
				// We need to create them only once, and they are never changed.
				Name: `${fileName}${this.request.body.Key.endsWith('/') ? '/' :''}`, // Add the dropped '/' for folders.
				Folder: containingFolder,
			}),
			...((this.request.body.MIME || !this.doesFileExist) && {MIME: this.getMimeType()}), // Set MIME if it was passed, or if this file doesn't exist yet.
			...(this.request.body.Sync && {Sync: this.request.body.Sync}), // Set Sync if it was passed
			...(!this.doesFileExist && !this.request.body.Sync && {Sync: this.syncTypes[0]}), // If file doesn't exist, and Sync wasn't passed, default to 'None'
			...(this.request.body.Hidden && {Hidden: this.request.body.Hidden}), // Set Hidden if it was passed
			...(this.request.body.Description && {Description: this.request.body.Description}) // Add a description if it was passed.
		};

		return metadata;
	}

	/**
	 * Download the file's metadata.
	 * @returns 
	 */
	async downloadFile() 
	{
		const downloadKey = (this.request.body && this.request.body.Key) ? this.request.body.Key : this.request.query.Key; 
		return await this.dal.downloadFileMetadata(downloadKey)
	}

	async listFiles()
	{
		try 
		{
			await this.getDoesFileExist();
			if(!this.doesFileExist && this.request.query.folder != '/') // The root folder is not created, and therefore isn't listed in the adal table. It is there by default.
			{
				console.error(`Could not find requested folder: '${this.getAbsolutePath(this.request.query.folder)}'`);

				const err: any = new Error(`Could not find requested folder: ${this.request.query.folder}`);
				err.code = 404;
				throw err;
			}
			const requestedFolder = this.request.query.folder.endsWith('/') ? this.request.query.folder.slice(0, -1) : this.request.query.folder; //handle trailing '/'

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
	
}

export default PfsService;