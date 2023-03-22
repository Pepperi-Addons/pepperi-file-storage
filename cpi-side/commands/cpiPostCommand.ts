import { Request } from "@pepperi-addons/debug-server/dist";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { ICommand, IPepperiDal, IPfsGetter, IPfsMutator, PfsService, PostService, RelativeAbsoluteKeyService } from "pfs-shared";
import { FileUploadService } from "../fileUpload.service";
import { OfflinePostService } from "./offlinePostService";
import jwtDecode from 'jwt-decode';

export class CpiPostCommand extends PfsService implements ICommand
{
	constructor(request: Request, pfsMutator: IPfsMutator, pfsGetter: IPfsGetter, protected pepperiDal: IPepperiDal)
	{
		super(request, pfsMutator, pfsGetter);
	}

	public async execute(): Promise<any> 
	{
		this.validateNoThumbnailsAreUpserted();

		const postService = await this.getPostService();

		postService.validatePostRequest();

		// Download the current saved metadata, if exists
		await postService.getCurrentItemData();

		// Further validation of input
		await postService.validateFieldsForUpload();

		// Write file data to device's storage and ADAL metadata table
		const res: any = await postService.mutatePfs();

		// Upload file to temp file
		// Do not await for this operation to finish, since it is not relevant for the response.
		// The upload should be done in the background.
		const fileUploadService = await this.getFileUploadService();
		fileUploadService.uploadLocalFileToTempFile(res);

		return res;

	}

	private async getFileUploadService() 
	{
		const distUUID = jwtDecode(await pepperi.auth.getAccessToken())['pepperi.distributoruuid'];
		const relativeAbsoluteKeService = new RelativeAbsoluteKeyService(distUUID, this.AddonUUID, this.request.query.resource_name);
		const fileUploadService = new FileUploadService(this.pepperiDal, pepperi.papiClient, this.AddonUUID, this.request.query.resource_name, relativeAbsoluteKeService);
		return fileUploadService;
	}

	private validateNoThumbnailsAreUpserted(): void 
	{
		const thumbnails = this.request.body?.Thumbnails;
		if(Array.isArray(thumbnails) && thumbnails.length > 0)
		{
			const errorMessage = "Thumbnails creation is not supported in offline mode.";
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
	}

	private async getPostService(): Promise<PostService>
	{
		const papiClient: PapiClient = await pepperi.papiClient;
		const token: string = await pepperi.auth.getAccessToken();
		return new OfflinePostService(papiClient, token, this.request, this.pfsMutator, this.pfsGetter);
	}
}
