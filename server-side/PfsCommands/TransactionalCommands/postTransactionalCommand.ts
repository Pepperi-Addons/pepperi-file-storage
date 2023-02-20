import * as path from 'path';
import fetch from 'node-fetch';
import jwtDecode from 'jwt-decode';
import { ImageResizer } from "../../imageResizer";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { ABaseTransactionalCommand } from "./aBaseTransactionalCommand";
import { ServerHelper } from '../../serverHelper';
import { CACHE_DEFAULT_VALUE, dataURLRegex, DESCRIPTION_DEFAULT_VALUE, EXTENSIONS_WHITELIST, HIDDEN_DEFAULT_VALUE, IPfsGetter, IPfsMutator, MAXIMAL_TREE_DEPTH, SECRETKEY_HEADER, SYNC_DEFAULT_VALUE, TransactionType } from 'pfs-shared';
import TempFileService from 'pfs-shared/lib/tempFileService';
import { Client, Request } from '@pepperi-addons/debug-server/dist';

export class PostTransactionalCommand extends ABaseTransactionalCommand{
	readonly MIME_FIELD_IS_MISSING = "Missing mandatory field 'MIME'";
	readonly TRANSACTION_TYPE: TransactionType = 'post' ;

	protected tempFileService: TempFileService;

	constructor(client: Client, request: Request, pfsMutator: IPfsMutator, pfsGetter: IPfsGetter) {
		super(client, request, pfsMutator, pfsGetter);

		this.tempFileService = new TempFileService(this.client.OAuthAccessToken);
	}
	async preLockLogic() 
	{
		await ServerHelper.validateAddonSecretKey(this.request.header, this.client, this.AddonUUID);

		if (!this.request.body.Key) 
		{
			throw new Error("Missing mandatory field 'Key'");
		}

		await this.validateExtension();

		if(this.getPathDepth() > MAXIMAL_TREE_DEPTH)
		{
			throw new Error(`Requested path is deeper than the maximum allowed depth of ${MAXIMAL_TREE_DEPTH}.`);
		}
		
		if (this.request.body.Thumbnails) 
		{
			this.validateThumbnailsRequest(this.request.body.Thumbnails);
		}
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

	private getPathDepth(): number 
	{
		let requestedPath = this.request.body.Key;
		if(!requestedPath.startsWith('/'))
		{
			requestedPath = `/${requestedPath}`;
		}
		const trailingSlashes = 2;
		return requestedPath.split('/').length - trailingSlashes;
	}

	/**
	 * Throw an error if the file's extension is not part of the whitelist.
	 */
	private async validateExtension() 
	{
		if(!this.request.body.Key.endsWith('/')) // Don't validate folders
		{
			const extension = path.extname(this.request.body.Key);
			
			if(!EXTENSIONS_WHITELIST.includes(extension))
			{
				throw new Error(extension ? `The requested file extension '${extension}' is not supported.` : 'The requested file does not have an extension.');
			}
		}
	}

    async lock(): Promise<void>
	{
        await super.rollback();

		await this.pfsMutator.lock(this.request.body.Key, this.TRANSACTION_TYPE);
    }

    async executeTransaction(): Promise<any>
	{
        // Download the current saved metadata, if exists
		await this.getCurrentItemData();

		// Further validation of input
		await this.validateFieldsForUpload();

		// Save the currently saved metadata on the lock - will be used for rollback purposes
		await this.pfsMutator.setRollbackData(this.existingFile);

		// Commit changes to S3 and ADAL metadata table
		const res: any = await this.mutatePfs();

		// Publish notification to subscribers
		await this.pfsMutator.notify(this.newFileFields, this.existingFile);

		return res;
    }

    private async mutatePfs() 
	{
		let res: any = {};

		await this.createParentFoldersIfMissing();

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

    private async createParentFoldersIfMissing() 
	{
		const missingFolders: string[] = await this.getMissingParentFolders();
		// Creating the missing folders from root to leaf allows the recovery in case of a failure.
		// this.getMissingParentFolders() assumes that if a folder exists, the entire path to it from root
		// also exists. If we create just the first folder (the one closest to the root) and then fail, in the next iteration
		// we will continue the creation from the next missing folder in line.
		for (const missingFolder of missingFolders) 
		{
			const existingFile = {doesFileExist: false};
			const newFileFields = {};
			const data = {
				Key: missingFolder,
				MIME: 'pepperi/folder',
			}

			await this.createFolder(data, existingFile, newFileFields);
		}
	}

    /**
	 * Assumes that if a folder exists, the entire path to it from root also exists
	 * @returns a list of missing parent folders, starting (index=0) from the closest to the root, ending closest to the leaf.
	 */
	private async getMissingParentFolders(): Promise<string[]> 
	{
		const missingFoldersList: string[] = [];

		if(!this.existingFile?.doesFileExist) // If the file does exist, there are no missing folders.
		{
			let canonizedPath = this.request.body.Key.startsWith('/') ? this.request.body.Key.slice(1) : this.request.body.Key;

			while(path.dirname(canonizedPath) !== '.')
			{
				const parentFolder = `${path.dirname(canonizedPath)}/`;
				if(!await this.doesParentFolderExist(canonizedPath))
				{
					missingFoldersList.unshift(parentFolder);
				}
				else
				{
					// if the direct parent folder exists, the entire path up to it also exists. 
					// There's no need to further investigate whether containing folders exist or not.
					break;
				}

				canonizedPath = parentFolder;
			}
		}

		return missingFoldersList;
	}

    private async doesParentFolderExist(key) 
	{
		let doesParentFolderExist = true;
		try 
		{
			await this.downloadFile(`${path.dirname(key)}/`);
		}
		catch 
		{
			doesParentFolderExist = false;
		}
		return doesParentFolderExist;
	}

    private async createFolder(data?, existingFile?, newFileFields?) 
	{
		await this.getMetadata(data, existingFile, newFileFields);	
		return await this.pfsMutator.mutateADAL(newFileFields ?? this.newFileFields, existingFile ?? this.existingFile);
	}

    private async createFile() 
	{
		let res: any = {};
		if(this.request.body.URI && (!this.tempFileService.isTempFile(this.request.body.URI) || this.request.body.Thumbnails))
		{
			this.newFileFields.buffer = await this.getFileDataBuffer(this.request.body.URI);
		}

		await this.getMetadata();
		
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

		console.log(`Successfully created a file.`);

		return res;
	}

    /**
	 * Returns a Metadata object representing the needed metadata.
	 * @returns a dictionary representation of the metadata.
	 */
	protected async getMetadata(data?, existingFile?, newFileFields?)
	{
		data = data ?? this.request.body;
		existingFile = existingFile ?? this.existingFile;
		newFileFields = newFileFields ?? this.newFileFields;

		const pathFoldersList = data.Key.split('/');
		if (data.Key.endsWith('/'))  //This is a new folder being created. We need to pop the trailing '' after splitting.
		{
			pathFoldersList.pop();
		}
		const fileName = pathFoldersList.pop();
		const containingFolder = pathFoldersList.join('/') + '/';

		newFileFields.Key = data.Key;
		newFileFields.ExpirationDateTime = data.ExpirationDateTime;
		newFileFields.DeletedBy = data.DeletedBy;
		newFileFields.IsTempFile = this.tempFileService.isTempFile(data.URI);

		if(!existingFile.doesFileExist)
		{
			newFileFields.Name = `${fileName}${data.Key.endsWith('/') ? '/' :''}`; // Add the dropped '/' for folders.
			newFileFields.Folder = containingFolder ? containingFolder : '/'; // Set '/' for root folder
			newFileFields.MIME = this.getMimeType(data);
			newFileFields.Hidden = data.Hidden ?? HIDDEN_DEFAULT_VALUE;
			newFileFields.ExpirationDateTime = data.ExpirationDateTime;

			if(!data.Key.endsWith('/')) // This is not a folder
			{
				newFileFields.Sync = data.Sync ?? SYNC_DEFAULT_VALUE;
				newFileFields.Description = data.Description ?? DESCRIPTION_DEFAULT_VALUE;
				newFileFields.Cache = data.Cache ?? CACHE_DEFAULT_VALUE;
				newFileFields.UploadedBy = await this.getUploadedByUUID();
				if(newFileFields.buffer)
				{
					newFileFields.FileSize = Buffer.byteLength(newFileFields.buffer);
				}
			}
			else //this is a folder
			{
				newFileFields.Sync = SYNC_DEFAULT_VALUE;
				newFileFields.Description = DESCRIPTION_DEFAULT_VALUE;
			}
			
		}
		else // The file does exist, there's no need to set Folder and Name fields
		{
			if(!data.Key.endsWith('/')) // This is not a folder
			{
				if(data.MIME) newFileFields.MIME = this.getMimeType(data);
				if(data.Sync) newFileFields.Sync = data.Sync;
				if(data.Description) newFileFields.Description = data.Description;
				if(data.hasOwnProperty('Cache')) newFileFields.Cache = data.Cache;

				let uploadedBy = '';
				if((data.URI || (data.hasOwnProperty('Cache') && data.Hidden != existingFile.Hidden)) && (uploadedBy = await this.getUploadedByUUID()) !== existingFile.UploadedBy) 
				// Assignment to uploadedBy var inside the if-statement is intentional.
				// Check if URI was passed, or the Hidden property is changed to avoid calling async getUploadedByUUID() unnecessarily.
				// Check if there's a discrepancy between current uploader and pervious to avoid updating the file's UploadedBy field unnecessarily.
				{
					newFileFields.UploadedBy = uploadedBy;
				}
				
				if(newFileFields.buffer)
				{
					newFileFields.FileSize = Buffer.byteLength(newFileFields.buffer);
				}
			}
			
			if(data.hasOwnProperty('Hidden') && data.Hidden != existingFile.Hidden) newFileFields.Hidden = data.Hidden;
		}

		if(data.Thumbnails && Array.isArray(data.Thumbnails))
		{
			newFileFields.Thumbnails = data.Thumbnails.map(thumbnailRequest => 
			{
				return {Size: thumbnailRequest.Size.toLowerCase()}
			});
		}
	}

    private getMimeType(data?): string 
	{
		data = data ?? this.request.body;

		let MIME = data.MIME;
		
		if(data.URI && this.isDataURL(data.URI))
		{
			// Get mime type from base64 data
			const parsedMIME = data.URI.match(/[^:\s*]\w+\/[\w-+\d.]+(?=[;| ])/)[0];

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
	 * Return the UUID of the user that uploads the file. Return blank string if it is the support admin user.
	 * @returns UUID of the user that uploaded the file
	 */
	private async getUploadedByUUID(): Promise<any> 
	{
		const userId = (jwtDecode(this.client.OAuthAccessToken))["pepperi.id"];
		const papiClient: PapiClient = ServerHelper.createPapiClient(this.client, this.AddonUUID, this.request.header[SECRETKEY_HEADER]);
		const isSupportAdminUser: boolean = (await papiClient.get(`/users/${userId}?fields=IsSupportAdminUser`)).IsSupportAdminUser;

		//Leave files uploaded by support admin user (i.e. uploading using integration) with a blank 
		return isSupportAdminUser ? '' : jwtDecode(this.client.OAuthAccessToken)['pepperi.useruuid'];
	}

    private async getFileDataBuffer(url) 
	{
		let buf: Buffer;

		if (this.isDataURL(url)) // dataURI get the base 64 part
		{ 
			buf = Buffer.from(url.match(dataURLRegex)[4], 'base64');
		}
		else //the URI is URL - download the data
		{
			buf = await this.downloadFileBufferFromURL(url);
		}

		return buf;
	}

    isDataURL(s) 
	{
        return !!s.match(dataURLRegex);
	}

    private async downloadFileBufferFromURL(url) 
	{
		const response = await fetch(url, { method: `GET` });
		const arrayData = await response.arrayBuffer();
		const buf = Buffer.from(arrayData);

		return buf;
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

    async unlock(key: string): Promise<void>{
        await this.pfsMutator.unlock(key);
    }

    private async validateFieldsForUpload() 
	{
		this.validateMIMEtype();

		if(this.request.body.Key.endsWith('/') && this.request.body.Hidden) // If trying to delete a folder
		{
			await this.validateNoContentsBeforeFolderDeletion();
		}
	}

    private validateMIMEtype() 
	{
		if (!this.existingFile.doesFileExist && !this.request.body.MIME && (! this.request.body.URI || !this.isDataURL(this.request.body.URI))) 
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

    private async validateNoContentsBeforeFolderDeletion() 
	{
		const whereClause = `Folder='${this.request.body.Key}'`;
		const folderContents = await this.pfsGetter.getObjects(whereClause);

		if (folderContents.length > 0) // Deleting a folder that has existing content is not currently supported.
		{
			const err: any = new Error(`Bad request. Folder content must be deleted before the deletion of the folder.`);
			err.code = 400;
			console.log(err.message);
			throw err;
		}
	}

	protected errorLogger(error: Error)
    {
		console.error(`Could not upload file ${this.request.body.Key}. ${error.message}`);
    }
}