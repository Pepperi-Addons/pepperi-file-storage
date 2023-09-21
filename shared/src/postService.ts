import { Request } from "@pepperi-addons/debug-server/dist";
import { PapiClient, SearchBody } from "@pepperi-addons/papi-sdk";
import path from "path";
import { CACHE_DEFAULT_VALUE, dataURLRegex, DESCRIPTION_DEFAULT_VALUE, EXTENSIONS_WHITELIST, HIDDEN_DEFAULT_VALUE, MAXIMAL_TREE_DEPTH, SYNC_DEFAULT_VALUE, pfsSchemaData } from "./constants";
import { ImageResizer } from "./imageResizer";
import { IPfsGetter } from "./iPfsGetter";
import { IPfsMutator } from "./iPfsMutator";
import PfsService from "./pfs.service";
import TempFileService from "./tempFileService";
import fetch from "node-fetch";


export abstract class PostService extends PfsService 
{
	readonly MIME_FIELD_IS_MISSING = "Missing mandatory field 'MIME'";

	protected tempFileService: TempFileService;

	constructor(protected papiClient: PapiClient, protected OAuthAccessToken: string,  request: Request, pfsMutator: IPfsMutator, pfsGetter: IPfsGetter) 
	{
		super(request, pfsMutator, pfsGetter);

		this.tempFileService = new TempFileService(OAuthAccessToken);
	}

	public validatePostRequest() 
	{
		if (!this.request.body.Key) 
		{
			throw new Error("Missing mandatory field 'Key'");
		}

		//URI and TemporaryFileURLs are mutually exclusive
		if (this.request.body.URI && this.request.body.TemporaryFileURLs)
		{
			throw new Error("Fields 'URI' and 'TemporaryFileURLs' are mutually exclusive.");
		}

		// Validate that if TemporaryFileURLs is provided, it is an array of strings.
		if (this.request.body.TemporaryFileURLs && !Array.isArray(this.request.body.TemporaryFileURLs))
		{
			throw new Error("Field 'TemporaryFileURLs' should be an array of strings.");
		}

		this.validateExtension();

		if (this.getPathDepth() > MAXIMAL_TREE_DEPTH) 
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

		const validThumbnailsSizes = thumbnails.every(thumbnail => thumbnail.Size.toLowerCase() === "200x200");
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
		if (!requestedPath.startsWith("/")) 
		{
			requestedPath = `/${requestedPath}`;
		}
		const trailingSlashes = 2;
		return requestedPath.split("/").length - trailingSlashes;
	}

	/**
     * Throw an error if the file's extension is not part of the whitelist.
     */
	private validateExtension() 
	{
		if (!this.request.body.Key.endsWith("/")) // Don't validate folders
		{
			const extension = path.extname(this.request.body.Key);

			if (!EXTENSIONS_WHITELIST.includes(extension)) 
			{
				throw new Error(extension ? `The requested file extension '${extension}' is not supported.` : "The requested file does not have an extension.");
			}
		}
	}

	public async validateFieldsForUpload() 
	{
		this.validateMIMEtype();

		// If file does not exist, validate that either URI or TemporaryFileURLs are provided.
		if (!this.existingFile.doesFileExist && !this.request.body.URI && !this.request.body.TemporaryFileURLs && !this.request.body.Key.endsWith("/"))
		{
			// The user might have wanted to use the deprecated presigned URL functionality.
			// (This is when you don't provide a URI nor TemporaryFileURLs at all)
			// If so, throw a more descriptive error message.
			throw new Error("Missing mandatory field 'URI' or 'TemporaryFileURLs'. PresignedURL functionality has been deprecated. Please use the TemporaryFileURLs field instead.\n For more information, see https://apidesign.pepperi.com/pfs-pepperi-file-service/get-files");
		}

		if(this.request.body.Key.endsWith("/") && this.request.body.Hidden) // If trying to delete a folder
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
		else if (!this.existingFile.doesFileExist && this.request.body.MIME == "pepperi/folder" && !this.request.body.Key.endsWith("/")) 
		{
			// if 'pepperi/folder' is provided on creation and the key is not ending with '/', the POST should fail
			throw new Error("On creation of a folder, the key must end with '/'");
		}
		else if (this.request.body.MIME && this.request.body.MIME != "pepperi/folder" && this.request.body.Key.endsWith("/")) 
		{
			// a folder's MIME type should always be 'pepperi/folder', otherwise the POST should fail
			throw new Error("A filename cannot contain a '/'.");
		}
	}

	private isDataURL(s) 
	{
		return !!s.match(dataURLRegex);
	}

	private async validateNoContentsBeforeFolderDeletion() 
	{
		const searchBody: SearchBody = {
			Where: `Folder='${this.request.body.Key}'`,
		};
		const folderContents = await this.pfsGetter.getObjects(searchBody);

		if (folderContents.Objects.length > 0) // Deleting a folder that has existing content is not currently supported.
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

	public async mutatePfs() 
	{
		let res: any = {};

		await this.createParentFoldersIfMissing();

		if (this.request.body.Key.endsWith("/")) 
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
				MIME: "pepperi/folder",
			};

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
			let canonizedPath = this.request.body.Key.startsWith("/") ? this.request.body.Key.slice(1) : this.request.body.Key;

			while(path.dirname(canonizedPath) !== ".")
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

	private async createFolder(data?, existingFile?, newFileFields?): Promise<any>
	{
		await this.getMetadata(data, existingFile, newFileFields);	
		return await this.pfsMutator.mutateADAL(newFileFields ?? this.newFileFields, existingFile ?? this.existingFile);
	}

	private async createFile(): Promise<any>
	{
		let res: any = {};
		if(this.request.body.URI || this.request.body.Thumbnails)
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
		
		await this.pfsMutator.mutateS3(this.newFileFields, this.existingFile);
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

		const pathFoldersList = data.Key.split("/");
		if (data.Key.endsWith("/"))  //This is a new folder being created. We need to pop the trailing '' after splitting.
		{
			pathFoldersList.pop();
		}
		const fileName = pathFoldersList.pop();
		const containingFolder = pathFoldersList.join("/") + "/";

		newFileFields.Key = data.Key;
		newFileFields.ExpirationDateTime = data.ExpirationDateTime;
		newFileFields.DeletedBy = data.DeletedBy;
		newFileFields.TemporaryFileURLs = data.TemporaryFileURLs;

		if(!existingFile.doesFileExist)
		{
			await this.getMetadataForNewObject(newFileFields, fileName, data, containingFolder);			
		}
		else // The file does exist, there's no need to set Folder and Name fields
		{
			await this.getMetadataForExistingObject(data, newFileFields, existingFile);
		}

		this.getThumbnailsMetadata(data, newFileFields, existingFile);

		// Copy any other metadata fields from the request body to the newFileFields object.
		// This is done after the above calls, so that the above calls can override any of these fields if needed.
		// This implementation will let us keep the read-only nature of some of the fields, while still allowing the user to update others.
		const pfsSchemaFields = new Set(Object.keys(pfsSchemaData.Fields));
		// We should also remove any transient fields from the request body, so that they won't be copied to the newFileFields object.
		const transientFields = new Set(["URI"]);
		Object.keys(data).forEach(key => 
		{
			if (!pfsSchemaFields.has(key) && !transientFields.has(key) &&!newFileFields[key]) 
			{
				newFileFields[key] = data[key];
			}
		});
	}

	private async getThumbnailsMetadata(data: any, newFileFields: any, existingFile: any) 
	{
		if (data.Thumbnails && Array.isArray(data.Thumbnails)) 
		{
			newFileFields.Thumbnails = data.Thumbnails.map(thumbnailRequest => 
			{
				return { Size: thumbnailRequest.Size.toLowerCase() };
			});
		}

		const shouldCreateThumbnails = (data.Thumbnails && data.Thumbnails.length > 0) ||  (existingFile.Thumbnails && data.URI); //The user asked for thumbnails, or the file already has thumbnails, and the file data is updated.
		if (shouldCreateThumbnails)
		{
			const buffer = newFileFields.buffer ?? await this.getFileDataBuffer(existingFile.URL);
			const MIME = newFileFields.MIME ?? this.existingFile.MIME;

			if(!newFileFields.buffer)
			{
				existingFile.buffer = buffer;
			}

			await this.createThumbnailsBuffers(buffer, MIME);
		}
	}

	private async getMetadataForExistingFile(data: any, newFileFields: any, existingFile: any) 
	{
		if (data.MIME) newFileFields.MIME = this.getMimeType(data);
		if (data.Sync) newFileFields.Sync = data.Sync;
		if (data.Description) newFileFields.Description = data.Description;
		if (data.hasOwnProperty("Cache")) newFileFields.Cache = data.Cache;
		if (newFileFields.buffer) newFileFields.FileSize = Buffer.byteLength(newFileFields.buffer);

		let uploadedBy = "";
		if ((data.URI || data.TemporaryFileURLs || (data.hasOwnProperty("Hidden") && data.Hidden != existingFile.Hidden)) && (uploadedBy = await this.getUploadedByUUID()) !== existingFile.UploadedBy)
		// Assignment to uploadedBy var inside the if-statement is intentional.
		// Check if URI or TemporaryFileURLs was passed, or the Hidden property is changed to avoid calling async getUploadedByUUID() unnecessarily.
		// Check if there's a discrepancy between current uploader and pervious to avoid updating the file's UploadedBy field unnecessarily.
		{
			newFileFields.UploadedBy = uploadedBy;
		}        
	}

	private async getMetadataForExistingObject(data: any, newFileFields: any, existingFile: any) 
	{
		if (!data.Key.endsWith("/")) // This is not a folder
		{
			await this.getMetadataForExistingFile(data, newFileFields, existingFile);
		}
    
		if (data.hasOwnProperty("Hidden") && data.Hidden != existingFile.Hidden)
			newFileFields.Hidden = data.Hidden;
	}
    
	private async getMetadataForNewFile(newFileFields: any, data: any) 
	{
		newFileFields.Sync = data.Sync ?? SYNC_DEFAULT_VALUE;
		newFileFields.Description = data.Description ?? DESCRIPTION_DEFAULT_VALUE;
		newFileFields.Cache = data.Cache ?? CACHE_DEFAULT_VALUE;
		newFileFields.UploadedBy = await this.getUploadedByUUID();
		if (newFileFields.buffer) 
		{
			newFileFields.FileSize = Buffer.byteLength(newFileFields.buffer);
		}
	}

	private getMetadataForNewFolder(newFileFields: any) 
	{
		newFileFields.Sync = SYNC_DEFAULT_VALUE;
		newFileFields.Description = DESCRIPTION_DEFAULT_VALUE;
	}

	private async getMetadataForNewObject(newFileFields: any, fileName: any, data: any, containingFolder: string) 
	{
		newFileFields.Name = `${fileName}${data.Key.endsWith("/") ? "/" : ""}`; // Add the dropped '/' for folders.
		newFileFields.Folder = containingFolder ? containingFolder : "/"; // Set '/' for root folder
		newFileFields.MIME = this.getMimeType(data);
		newFileFields.Hidden = data.Hidden ?? HIDDEN_DEFAULT_VALUE;
		newFileFields.ExpirationDateTime = data.ExpirationDateTime;

		if (!data.Key.endsWith("/")) // This is not a folder
		{
			await this.getMetadataForNewFile(newFileFields, data);
		}
		else //this is a folder
		{
			this.getMetadataForNewFolder(newFileFields);
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
	protected abstract getUploadedByUUID(): Promise<string>;

	private async getFileDataBuffer(url) 
	{
		let buf: Buffer;

		if (this.isDataURL(url)) // dataURI get the base 64 part
		{ 
			buf = Buffer.from(url.match(dataURLRegex)[4], "base64");
		}
		else //the URI is URL - download the data
		{
			buf = await this.downloadFileBufferFromURL(url);
		}

		return buf;
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

	public override async getCurrentItemData(): Promise<void> 
	{
		await super.getCurrentItemData();
	}
}
