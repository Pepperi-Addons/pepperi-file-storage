import { AddonData, PapiClient, SearchBody, TemporaryFile } from "@pepperi-addons/papi-sdk";
import fetch, { RequestInit, Response } from "node-fetch";
import fs from "fs";
import { createHash } from "crypto";
import { FileToUpload, IPepperiDal, RelativeAbsoluteKeyService, SharedHelper } from "pfs-shared";
import { AddonUUID } from "../addon.config.json";
import CpiPepperiDal from "./dal/pepperiDal";
import PQueue from "p-queue";
import { FilesToUploadDal } from "./dal/filesToUploadDal";


export class FileUploadService 
{
	protected static readonly queueConcurrency = 5;
	protected static filesUploadQueue = new PQueue({ concurrency: FileUploadService.queueConcurrency });

	protected static interval: NodeJS.Timeout | undefined = undefined;
	protected static readonly periodicTaskInterval = 1000 * 60 * 5; // Every 5 minutes

	protected clientAddonUUID: string;
	protected clientAddonSchemaName: string;
	protected relativeAbsoluteKeyService: RelativeAbsoluteKeyService;
	protected filesToUploadDal: FilesToUploadDal;


	protected constructor(
        protected pepperiDal: IPepperiDal,
        protected papiClient: PapiClient,
        protected fileToUpload: FileToUpload,
	)
	{
		this.relativeAbsoluteKeyService = new RelativeAbsoluteKeyService(fileToUpload.AbsolutePath);
		this.clientAddonUUID = this.relativeAbsoluteKeyService.clientAddonUUID;
		this.clientAddonSchemaName = this.relativeAbsoluteKeyService.clientSchemaName;
		this.filesToUploadDal = new FilesToUploadDal(this.pepperiDal);
	}

	/**
	 * Initiate the periodic task that uploads all files in the FilesToUpload table.
	 * This method should be called once the addon is loaded.
	 * A periodic task is initiated only if it wasn't initiated before, to prevent
	 * multiple intervals running in parallel.
	 * @returns {void}
	 */
	public static initiatePeriodicUploadInterval(): void
	{
		if (!this.interval)
		{
			this.interval = setInterval(async () => 
			{
				await this.asyncUploadAllFilesToUpload();
			}, this.periodicTaskInterval); // Every 10 seconds
		}
	  }
        
	/**
     * Add a promise to the queue that will upload a single file.
     */
	public asyncUploadFile(): void
	{
		// We don't await this promise so the answer could be
		// returned to the client, while the promise resolves in the
		// background.
		FileUploadService.filesUploadQueue.add(() => this.uploadLocalFileToTempFile());
	}

	/**
     * Add promises to the queue that will upload all files in the FilesToUpload table.
     */
	public static async asyncUploadAllFilesToUpload(): Promise<void>
	{
		console.log(`asyncUploadAllFilesToUpload initiated: ${new Date().toISOString()}`);

		const filesToUploadDal = new FilesToUploadDal(new CpiPepperiDal());
		//Read all files from FilesToUpload table
		const filesToUpload = (await filesToUploadDal.getAllFilesToUpload()).filter(file => !file.Hidden);
		const pepperiDal = new CpiPepperiDal();
		const papiClient = pepperi.papiClient;

		console.log(`asyncUploadAllFilesToUpload found ${filesToUpload.length} files to upload`);

		// We don't await this promise so the answer could be
		// returned to the client, while the promise resolves in the
		// background.
		FileUploadService.filesUploadQueue.addAll(filesToUpload.map(fileToUpload => () => 
		{
			const fileUploadService = this.getInstance(pepperiDal, papiClient, fileToUpload);
			return fileUploadService.uploadLocalFileToTempFile();
		}));

		console.log(`asyncUploadAllFilesToUpload finished: ${new Date().toISOString()}`);
	}

	public static getInstance(pepperiDal: IPepperiDal, papiClient: PapiClient, fileToUpload: FileToUpload): FileUploadService
	{
		const fileUploadServiceClass: typeof FileUploadService = fileToUpload.ShouldFailUpload ? FileUploadTestingService : FileUploadService;

		return new fileUploadServiceClass(pepperiDal, papiClient, fileToUpload);
	}

	protected async uploadLocalFileToTempFile(): Promise<void>
	{
		if(!await this.shouldUploadFile())
		{
			this.fileUploadLog("Could not find in the FilesToUpload table. Skipping...");
			return;
		}

		const fileMetadata  = await this.getFileMetadata();

		let tempFileUrls: TemporaryFile;

		// Create a temporary file in the PFS.
		// This is an online call to the PFS.
		try
		{
			tempFileUrls = await this.papiClient.addons.pfs.temporaryFile();
			if(tempFileUrls)
			{
				this.fileUploadLog(`Successfully created a temp file on S3.`);
			}
			else
			{
				throw new Error();
			}
		}
		catch (err)
		{
			this.fileUploadLog(`Failed to create a temp file on S3.`);
			return;
		}

		// This is an offline call.
		const fileDataBuffer: Buffer = await this.getFileDataBufferFromDisk();

		// Prior to uploading the file, check if there is a newer version of the file in the FilesToUpload table.
		if((await this.filesToUploadDal.getLatestEntryKey(this.fileToUpload)) !== this.fileToUpload.Key)
		{
			this.fileUploadLog("A newer version of the file was uploaded. Skipping...");

			await this.removeFromFilesToUpload();

			return;
		}

		// Upload the file to the temporary file.
		// This is an online call.

		let uploadResponse;
		try
		{
			uploadResponse = await this.uploadFileToTempUrl(fileDataBuffer, tempFileUrls.PutURL);
		}
		catch(error)
		{
			const errorMessage = `Error trying to upload. ${error instanceof Error ? error.message : "Unknown error occurred"}`;
			uploadResponse = {
				status: 500,
				statusText: errorMessage
			};
		}

		if (uploadResponse.status !== 200) 
		{
			this.fileUploadLog(`Failed to upload file to S3. Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
			// The FilesToUpload table entry isn't, so that we can try again later.
			return;
		}

		this.fileUploadLog(`File successfully uploaded to a temp file on S3.`);

		const release = await FilesToUploadDal.mutex.acquire();
		try
		{
			const isLatestEntry = (await this.filesToUploadDal.getLatestEntryKey(this.fileToUpload)) === this.fileToUpload.Key;
			if(isLatestEntry)
			{
				// Setting the file's TemporaryFileURLs property to point to the temporary file's CDN URL.
				await this.setTemporaryFileURLs(fileMetadata, tempFileUrls);

				// Remove all older versions of the file from the FilesToUpload table (including this one).
				await this.filesToUploadDal.hideOlderEntries(this.fileToUpload);

				await this.deleteFileFromDisk(fileDataBuffer, fileMetadata);
			}
		}
		finally
		{
			release();
		}

		// Remove the file from the FilesToUpload table.
		// At this point we might or might not have already hidden this entry.
		// Just to avoid another if-condition, go ahead and remove weather it was removed or not.
		await this.removeFromFilesToUpload();
	}

	/**
	 * Delete the file from the device's storage.
	 * 
	 * The file is deleted only if the oldBuffer and newBuffer have the same MD5 value,
	 * and the ADAL entry is not marked Sync = "Device" | "Always".
	 * 
	 * Since the file might have been updated while the upload was in progress,
	 * we need to make sure we delete the correct version of the file.
	 * @param {Buffer} oldBuffer - The buffer of the file before the upload.
	 */
	protected async deleteFileFromDisk(oldBuffer: Buffer, fileMetadata: { Key: string; MIME: string; URL: string; Sync: "None" | "Device" | "DeviceThumbnail" | "Always"}): Promise<void>
	{
		// Validate the entry's Sync property, and that the file on the device's storage is up to date.
		// If so, delete the file from the device's storage.
		// The buffer check is done after the Sync check, to avoid unnecessary file reads.
		if(!(this.shouldFileBeKeptOnDevice(fileMetadata)) && await this.isBufferUpToDate(oldBuffer))
		{
			this.fileUploadLog(`Deleting file from the device's storage...`);

			const absolutePath = `${await pepperi.files.rootDir()}/${this.fileToUpload.AbsolutePath}`;

			try
			{
				await fs.promises.unlink(absolutePath);
				this.fileUploadLog(`Successfully deleted file from the device's storage.`);
			}
			catch(error)
			{
				this.fileUploadLog(`Failed to delete file from the device's storage. Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`);
			}
		}
	}

	protected async isBufferUpToDate(oldBuffer: Buffer): Promise<boolean>
	{
		const newBuffer = await this.getFileDataBufferFromDisk();

		const md5Old = createHash("md5").update(oldBuffer).digest("hex");
		const md5New = createHash("md5").update(newBuffer).digest("hex");

		return md5Old === md5New;
	}

	protected shouldFileBeKeptOnDevice(fileMetadata: { Key: string; MIME: string; URL: string; Sync: "None" | "Device" | "DeviceThumbnail" | "Always"}): boolean
	{
		return fileMetadata.Sync === "Device" || fileMetadata.Sync === "Always";
	}

	/**
     * Set the file's TemporaryFileURLs property to point to the temporary file's CDN URL.
     * @param fileMetadata 
     * @param tempFileUrls 
     */
	private async setTemporaryFileURLs(fileMetadata: { Key: string; MIME: string; URL: string; }, tempFileUrls: TemporaryFile): Promise<void>
	{
		this.fileUploadLog(`Updating file TemporaryFileURLs to point to the temporary file...`);

		fileMetadata["TemporaryFileURLs"] = [tempFileUrls.TemporaryFileURL];
		const tableName = SharedHelper.getPfsTableName(this.clientAddonUUID, this.clientAddonSchemaName);

		await this.pepperiDal.postDocumentToTable(tableName, fileMetadata);

		this.fileUploadLog(`The file's TemporaryFileURLs property was successfully updated to point to the temporary file.`);
	}

	protected async shouldUploadFile(): Promise<boolean>
	{
		// Try get the file from the FilesToUpload table.
		const currentFileToUpload = await this.filesToUploadDal.getByKey(this.fileToUpload.Key!);
		return (currentFileToUpload && !currentFileToUpload.Hidden);
	}


	protected async getFileMetadata(): Promise<{ Key: string; MIME: string; URL: string; Sync: "None" | "Device" | "DeviceThumbnail" | "Always"}> 
	{
		const tableName = SharedHelper.getPfsTableName(this.clientAddonUUID, this.clientAddonSchemaName);
		const relativePath = this.relativeAbsoluteKeyService.getRelativePath(this.fileToUpload.AbsolutePath);
		const searchBody: SearchBody = {
			KeyList: [relativePath],
			Fields: ["Key", "MIME", "URL", "Sync"],
		};
		const fileMetadata = (await this.pepperiDal.searchDataInTable(tableName, searchBody)).Objects[0];

		if (!this.varHasKeyMimeTypeAndUrl(fileMetadata)) 
		{
			throw new Error(`Failed to get file metadata for file "${this.fileToUpload.AbsolutePath}".`);
		}

		return fileMetadata;
	}

	protected  varHasKeyMimeTypeAndUrl(fileMetadata: AddonData): fileMetadata is { Key: string, MIME: string, URL: string, Sync: "None" | "Device" | "DeviceThumbnail" | "Always"}
	{
		return fileMetadata?.Key && fileMetadata?.MIME && fileMetadata?.URL && fileMetadata?.Sync;
	}

	/**
     * Gets the file data as a buffer.
     * @returns The file data as a buffer.
     * @throws An error if the file data could not be retrieved.
     * @throws An error if the file data could not be converted to a buffer.
     */
	protected async getFileDataBufferFromDisk(): Promise<Buffer>
	{
		this.fileUploadLog(`Getting file's data from the device's storage...`);

		const absolutePath = `${await pepperi.files.rootDir()}/${this.fileToUpload.AbsolutePath}`;
		const buffer: Buffer = await fs.promises.readFile(absolutePath);

		this.fileUploadLog(`Successfully got file data from the device's storage.`);

		return buffer;
	}

	/**
     * Uploads a file to a temporary file on S3.
     * @param buffer The file data as a buffer.
     * @param putURL The URL to upload the file to.
     * @returns The response from the upload.
     */
	protected async uploadFileToTempUrl(buffer: Buffer, putURL: string): Promise<Response>
	{
		const requestOptions: RequestInit = {
			method: "PUT",
			body: buffer,
			headers: {
				"Content-Length": buffer.length.toString()
			}
		};

		return await fetch(putURL, requestOptions);
	}

	/**
     * Removes the file from the FilesToUpload table.
     */
	protected async removeFromFilesToUpload(): Promise<void>
	{
		this.fileUploadLog(`Removing file from the FilesToUpload table...`);

		const hiddenFileToUpload: FileToUpload = { ...this.fileToUpload, Hidden: true };
		await this.filesToUploadDal.upsert(hiddenFileToUpload);

		this.fileUploadLog(`File successfully removed from the FilesToUpload table.`);
	}

	/**
     * The method logs a message to the console with a prefix.
     * @param message The message to log.
     */
	protected fileUploadLog(message: string): void
	{
		const uploadToTempFileDebugPrefix = `uploadToTempFile: `;
		const fileUploadLogPrefix = `${uploadToTempFileDebugPrefix}File '${this.fileToUpload.AbsolutePath}' with UUID '${this.fileToUpload.Key}': `;
		console.log(`${fileUploadLogPrefix}${message}`);
	}
}

export class FileUploadTestingService extends FileUploadService
{

	 protected override async uploadFileToTempUrl(buffer: Buffer, putURL: string): Promise<Response>
	 {
		 if(this.fileToUpload.ShouldFailUpload)
		 {
			this.fileUploadLog(`Intentionally failing to upload file to temp url...`);

			this.fileUploadLog(`About to delete ShouldFailUpload flag from file...`);

			const release = await FilesToUploadDal.mutex.acquire();
			try
			{
				this.fileToUpload.ShouldFailUpload = false;
				await this.filesToUploadDal.upsert(this.fileToUpload);
				this.fileUploadLog(`Successfully deleted ShouldFailUpload flag from file.`);
			}
			catch (error)
			{
				this.fileUploadLog(`Failed to delete ShouldFailUpload flag from file. Error: ${error}`);
			}
			finally
			{
				release();
			}

			throw new Error("Intentionally failed to upload file to temp url.");
		 }

		 return await super.uploadFileToTempUrl(buffer, putURL);
	}

	protected override fileUploadLog(message: string): void 
	{
		const superLog = super.fileUploadLog(message);

		console.log(`FileUploadTestingService - ${superLog}`);
	}

}
