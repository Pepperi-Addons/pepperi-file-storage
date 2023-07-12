import { PapiClient, SearchBody } from "@pepperi-addons/papi-sdk";
import fetch, { RequestInit, Response } from "node-fetch";
import fs from "fs";
import { FILES_TO_UPLOAD_TABLE_NAME, FileToUpload, IPepperiDal, RelativeAbsoluteKeyService, SharedHelper, TempFile } from "pfs-shared";
import { AddonUUID } from "../addon.config.json";
import CpiPepperiDal from "./dal/pepperiDal";
import PQueue from "p-queue";

declare global {
    //  for singleton
    var periodicallyUploadFiles: () => void;
}
export class FileUploadService 
{

	// To avoid race conditions, we use a queue to upload files one by one.
	protected static readonly queueConcurrency = 1;
	protected static filesUploadQueue = new PQueue({ concurrency: FileUploadService.queueConcurrency });

	protected clientAddonUUID: string;
	protected clientAddonSchemaName: string;
	protected relativeAbsoluteKeyService: RelativeAbsoluteKeyService;


	constructor(
        protected pepperiDal: IPepperiDal,
        protected papiClient: PapiClient,
        protected fileToUpload: FileToUpload,
	)
	{
		this.relativeAbsoluteKeyService = new RelativeAbsoluteKeyService(fileToUpload.AbsolutePath);
		this.clientAddonUUID = this.relativeAbsoluteKeyService.clientAddonUUID;
		this.clientAddonSchemaName = this.relativeAbsoluteKeyService.clientSchemaName;
	}
        
	/**
     * Add a promise to the queue that will upload a single file.
     */
	public async asyncUploadFile(): Promise<void>
	{
		await FileUploadService.filesUploadQueue.add(() => this.uploadLocalFileToTempFile());
	}

	/**
     * Add promises to the queue that will upload all files in the FilesToUpload table.
     */
	public static async asyncUploadAllFilesToUpload(): Promise<void>
	{
		//Read all files from FilesToUpload table
		const filesToUpload = (await pepperi.addons.data.uuid(AddonUUID).table(FILES_TO_UPLOAD_TABLE_NAME).search({})).Objects.filter(file => !file.Hidden) as FileToUpload[];
		const pepperiDal = new CpiPepperiDal();
		const papiClient = pepperi.papiClient;

		await FileUploadService.filesUploadQueue.addAll(filesToUpload.map(fileToUpload => () => 
		{
			const fileUploadService = new FileUploadService(pepperiDal, papiClient, fileToUpload);
			return fileUploadService.uploadLocalFileToTempFile();
		}));
	}

	protected async uploadLocalFileToTempFile(): Promise<void>
	{
		if(!await this.shouldUploadFile())
		{
			this.fileUploadLog("Could not find in the FilesToUpload table. Skipping...");
			return;
		}

		const fileMetadata  = await this.getFileMetadata();

		let tempFileUrls: TempFile;

		// Create a temporary file in the PFS.
		// This is an online call to the PFS.
		try
		{
			tempFileUrls = (await this.papiClient.post(`/addons/api/${AddonUUID}/api/temporary_file`, {})) as TempFile;
			this.fileUploadLog(`Successfully created a temp file on S3.`);
		}
		catch (err)
		{
			this.fileUploadLog(`Failed to create a temp file on S3.`);
			return;
		}

		// This is an offline call.
		const fileDataBuffer: Buffer = await this.getFileDataBufferFromDisk();

		// Upload the file to the temporary file.
		// This is an online call.
		const uploadResponse = await this.uploadFileToTempUrl(fileDataBuffer, tempFileUrls.PutURL);

		if (uploadResponse.status !== 200) 
		{
			this.fileUploadLog(`Failed to upload file to S3. Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
			return;
		}

		this.fileUploadLog(`File successfully uploaded to a temp file on S3.`);

		// Remove the file from the FilesToUpload table.
		await this.removeFromFilesToUpload();

		// Update the file's TemporaryFileURLs array to point to the temporary file.
		await this.setTemporaryFileURLs(fileMetadata, tempFileUrls);
	}

	/**
     * Sets the file's TemporaryFileURLs property to point to the temporary file's CDN URL.
     * @param fileMetadata 
     * @param tempFileUrls 
     */
	private async setTemporaryFileURLs(fileMetadata: { Key: string; MIME: string; URL: string; }, tempFileUrls: TempFile): Promise<void>
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
		const currentFileToUpload = await pepperi.addons.data.uuid(AddonUUID).table(FILES_TO_UPLOAD_TABLE_NAME).key(this.fileToUpload.Key!) as unknown as FileToUpload;
		return (currentFileToUpload && !currentFileToUpload.Hidden);
	}


	protected async getFileMetadata(): Promise<{ Key: string; MIME: string; URL: string; }> 
	{
		const tableName = SharedHelper.getPfsTableName(this.clientAddonUUID, this.clientAddonSchemaName);
		const relativePath = this.relativeAbsoluteKeyService.getRelativePath(this.fileToUpload.AbsolutePath);
		const searchBody: SearchBody = {
			KeyList: [relativePath],
			Fields: ["Key", "MIME", "URL"],
		};
		const fileMetadata = await this.pepperiDal.searchDataInTable(tableName, searchBody)[0];

		if (!this.varHasKeyMimeTypeAndUrl(fileMetadata)) 
		{
			throw new Error(`Failed to get file metadata for file "${this.fileToUpload.AbsolutePath}".`);
		}

		return fileMetadata;
	}

	protected  varHasKeyMimeTypeAndUrl(fileMetadata: any): fileMetadata is { Key: string, MIME: string, URL: string }
	{
		return fileMetadata.Key && fileMetadata.MIME && fileMetadata.URL;
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
		await pepperi.addons.data.uuid(AddonUUID).table(FILES_TO_UPLOAD_TABLE_NAME).upsert(hiddenFileToUpload);

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
