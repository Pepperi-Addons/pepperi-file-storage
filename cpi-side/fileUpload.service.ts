import { PapiClient } from "@pepperi-addons/papi-sdk";
import fetch, { RequestInit, Response } from "node-fetch";
import fs from 'fs';
import { FILES_TO_UPLOAD_TABLE_NAME, IPepperiDal, RelativeAbsoluteKeyService, SharedHelper, TempFile } from "pfs-shared";
import { AddonUUID } from "../addon.config.json";


export class FileUploadService {
    public constructor(
        protected pepperiDal: IPepperiDal,
        protected papiClient: PapiClient,
        protected clientAddonUUID:string,
        protected clientAddonSchemaName: string,
        protected relativeAbsoluteKeyService: RelativeAbsoluteKeyService,
        ) {}

    
    public async uploadLocalFileToTempFile(file: { Key: string, MIME: string, URL: string}): Promise<void>
    {

        let tempFile: TempFile;
        const absolutePath = this.relativeAbsoluteKeyService.getAbsolutePath(file.Key);
        // Create a temporary file in the PFS.
        // This is an online call to the PFS.
        try
        {
            tempFile = (await this.papiClient.post(`/addons/api/${AddonUUID}/api/temporary_file`, {})) as TempFile;
        }
        catch (err)
        {
            this.fileUploadLog(`Failed to create a temp file on S3 for file "${absolutePath}".`);
            return;
        }

        this.fileUploadLog(`Successfully created a temp file on S3 for file "${absolutePath}".`);

        // Get the file's data from the device's storage.
        // This is an offline call.
        this.fileUploadLog(`Getting file ${absolutePath} data from the device's storage...`);
        const fileDataBuffer: Buffer = await this.getFileDataBuffer(absolutePath);
        this.fileUploadLog(`Successfully got file ${absolutePath} data from the device's storage.`);

        // Upload the file to the temporary file.
        // This is an online call.
        const uploadResponse = await this.uploadFileToTempUrl(fileDataBuffer, tempFile.PutURL);

        if (uploadResponse.status !== 200) {
            this.fileUploadLog(`Failed to upload file ${absolutePath} to S3. Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
            return;
        }

        this.fileUploadLog(`File ${absolutePath} was successfully uploaded to a temp file on S3.`);

        // Remove the file from the FilesToUpload table.
        this.fileUploadLog(`Removing file ${absolutePath} from the FilesToUpload table...`)

        await pepperi.addons.data.uuid(AddonUUID).table(FILES_TO_UPLOAD_TABLE_NAME).upsert({ Key: absolutePath, Hidden: true });

        this.fileUploadLog(`File ${absolutePath} was successfully upserted to the FilesToUpload table.`);

        // Update the file's URL on the schema to point to the temporary file.
        this.fileUploadLog(`Updating file ${absolutePath} URL to point to the temporary file...`);
        file.URL = tempFile.TemporaryFileURL;
        const tableName = SharedHelper.getPfsTableName(this.clientAddonUUID, this.clientAddonSchemaName);

        await this.pepperiDal.postDocumentToTable(tableName, file);
        this.fileUploadLog(`File ${absolutePath} URL was successfully updated to point to the temporary file.`);
    }

    /**
     * Gets the file data as a buffer.
     * @param absoluteKey The file's absolute key.
     * @returns The file data as a buffer.
     * @throws An error if the file data could not be retrieved.
     * @throws An error if the file data could not be converted to a buffer.
     */
    async getFileDataBuffer(absoluteKey: string): Promise<Buffer>
    {
        const absolutePath = `${await pepperi.files.rootDir()}/${absoluteKey}`;
        const buffer: Buffer = await fs.promises.readFile(absolutePath);
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
            method: 'PUT',
            body: buffer,
            headers: {
                "Content-Length": buffer.length.toString()
            }
        };

        return await fetch(putURL, requestOptions);
    }

    /**
     * The method logs a message to the console with a prefix.
     * @param message The message to log.
     */
    protected fileUploadLog(message: string): void
    {
        const uploadToTempFileDebugPrefix = `uploadToTempFile: `;
        console.log(`${uploadToTempFileDebugPrefix}${message}`);
    }
}
