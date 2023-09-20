import { Request } from "@pepperi-addons/debug-server/dist";
import { AddonFile, PapiClient, TemporaryFile } from "@pepperi-addons/papi-sdk";
import fetch, { RequestInit } from "node-fetch";
import { ICommand, IntegrationTestBody, IPepperiDal, IPfsGetter, IPfsMutator, PfsService, PostService } from "pfs-shared";
import { OfflinePostService } from "./offlinePostService";
import { FilesToUploadDal } from "../dal/filesToUploadDal";


export class WebAppUrlPostCommand extends PfsService implements ICommand
{
	protected filesToUploadDal: FilesToUploadDal;

	
	constructor(request: Request, pfsMutator: IPfsMutator, pfsGetter: IPfsGetter, protected pepperiDal: IPepperiDal)
	{
		super(request, pfsMutator, pfsGetter);
		this.filesToUploadDal = new FilesToUploadDal(this.pepperiDal);
	}

	public async execute(): Promise<any> 
	{
		this.validateNoThumbnailsAreUpserted();

		await this.handleDataURI();

		const postService = await this.getPostService();

		postService.validatePostRequest();

		// Download the current saved metadata, if exists
		await postService.getCurrentItemData();

		// Further validation of input
		await postService.validateFieldsForUpload();

		// Write file data to device's storage and ADAL metadata table
		const res: any = await postService.mutatePfs();

		return res;
	}

	/**
	 * Handles the case where the file data is sent as a data URI (instead of TemporaryFileURL).
	 * In that case, a Temporary File is created and the data URI is written to it.
	 * The TemporaryFileURL is then set on the request's body, and the
	 * original URI property is removed.
	 */
	protected async handleDataURI(): Promise<void>
	{
		// Since MobilePostCommand inherits from this class, we need to make sure we're in a web app.
		// When on mobile, the URI-to-TemporaryFileURL conversion is done using the FileUploadService.
		const isWebApp: boolean = (this.request.body as IntegrationTestBody)?.IntegrationTestData?.IsWebApp ?? await global["app"]["wApp"]["isWebApp"]();
		
		if(this.request.body?.URI && isWebApp)
		{
			// Create a temporary file
			const tempFile: TemporaryFile = await pepperi.papiClient.addons.pfs.temporaryFile();

			// Convert data uri to buffer
			const dataUriBuffer = this.getBufferFromDataUri();

			// PUT the data URI buffer to the temporary file
			await this.putBufferToUrl(dataUriBuffer, tempFile.PutURL);

			// Set the temporary file's URL on the request's body
			(this.request.body as AddonFile).TemporaryFileURLs = [tempFile.TemporaryFileURL];

			// Remove the URI property from the request's body
			delete (this.request.body as AddonFile).URI;
		}
	}


	/**
	 * PUTs the data URI buffer to the temporary file's PUT URL.
	 * @param {Buffer} buffer The buffer to put
	 * @param {string} putUrl The url to PUT the buffer to
	 * @returns {Promise<void>}
	 */
	private async putBufferToUrl(buffer: Buffer, putUrl: string): Promise<void>
	{
		const requestOptions: RequestInit = {
			method: "PUT",
			body: buffer,
			headers: {
				"Content-Length": buffer.length.toString()
			}
		};

		const fetchResponse = await fetch(putUrl, requestOptions);
		if(!fetchResponse.ok)
		{
			const errorMessage = `Failed to PUT buffer to URL. Status: '${fetchResponse.status}' Reason: '${fetchResponse.statusText}'.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
	}

	/**
	 * Gets a buffer from the data URI in the request's body.
	 * @returns {Buffer} Buffer from the data URI
	 */
	private getBufferFromDataUri(): Buffer
	{
		const dataUri = this.request.body.URI;
		const dataUriParts = dataUri.split(",");
		const dataUriBuffer = Buffer.from(dataUriParts[1], "base64");

		return dataUriBuffer;
	}

	protected validateNoThumbnailsAreUpserted(): void 
	{
		const thumbnails = this.request.body?.Thumbnails;
		if(Array.isArray(thumbnails) && thumbnails.length > 0)
		{
			const errorMessage = "Thumbnails creation is not supported in offline mode.";
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
	}

	protected async getPostService(): Promise<PostService>
	{
		const papiClient: PapiClient = await pepperi.papiClient;
		const token: string = await pepperi.auth.getAccessToken();
		// papiClient is as any since there's a discrepancy between pepperi.papiClient (cpi-node package) and papi-sdk. 
		// This is a workaround until the discrepancy is resolved.
		return new OfflinePostService(papiClient as any, token, this.request, this.pfsMutator, this.pfsGetter);
	}
}
