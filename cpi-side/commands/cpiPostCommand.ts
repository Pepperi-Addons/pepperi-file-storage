import { Request } from "@pepperi-addons/debug-server/dist";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { FILES_TO_UPLOAD_TABLE_NAME, FileToUpload, ICommand, IPepperiDal, IPfsGetter, IPfsMutator, PfsService, PostService, RelativeAbsoluteKeyService } from "pfs-shared";
import { FileUploadService } from "../fileUpload.service";
import { OfflinePostService } from "./offlinePostService";
import jwtDecode from "jwt-decode";
import { v4 as uuid } from "uuid";

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

		await this.uploadToTempFile(res);

		return res;
	}

	private async uploadToTempFile(res: any): Promise<void>
	{
		const relativeAbsoluteKeyService = await this.getRelativeAbsoluteKeyService();
		// Save the file to the FilesToUpload table
		const fileToUpload: FileToUpload = {
			Key: uuid(),
			AbsolutePath: relativeAbsoluteKeyService.getAbsolutePath(res.Key!),
		};

		await this.pepperiDal.postDocumentToTable(FILES_TO_UPLOAD_TABLE_NAME, fileToUpload);

		// Upload file to temp file
		const fileUploadService = new FileUploadService(this.pepperiDal, pepperi.papiClient, fileToUpload);
		await fileUploadService.asyncUploadFile();
	}

	private async getRelativeAbsoluteKeyService(): Promise<RelativeAbsoluteKeyService>
	{
		const distUUID = jwtDecode(await pepperi.auth.getAccessToken())["pepperi.distributoruuid"];
		return new RelativeAbsoluteKeyService(distUUID, this.AddonUUID, this.request.query.resource_name);
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
