import { Request } from "@pepperi-addons/debug-server/dist";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { FileToUpload, ICommand, IPepperiDal, IPfsGetter, IPfsMutator, PfsService, PostService, RelativeAbsoluteKeyService } from "pfs-shared";
import { FileUploadService } from "../fileUpload.service";
import { OfflinePostService } from "./offlinePostService";
import jwtDecode from "jwt-decode";
import { v4 as uuid } from "uuid";
import { FilesToUploadDal } from "../dal/filesToUploadDal";

export class CpiPostCommand extends PfsService implements ICommand
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

		await this.filesToUploadDal.upsert(fileToUpload);

		const isLatestEntry = (await this.filesToUploadDal.getLatestEntryKey(fileToUpload)) === fileToUpload.Key;
		if(isLatestEntry)
		{
			// Upload file to temp file
			const fileUploadService = new FileUploadService(this.pepperiDal, pepperi.papiClient, fileToUpload);
			await fileUploadService.asyncUploadFile();
		}
		else
		{
			console.log(`A newer version of file ${fileToUpload.AbsolutePath} was already uploaded to temp file. Skipping upload.`);
			fileToUpload.Hidden = true;
			this.filesToUploadDal.upsert(fileToUpload);
		}
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
		// papiClient is as any since there's a discrepancy between pepperi.papiClient (cpi-node package) and papi-sdk. 
		// This is a workaround until the discrepancy is resolved.
		return new OfflinePostService(papiClient as any, token, this.request, this.pfsMutator, this.pfsGetter);
	}
}
