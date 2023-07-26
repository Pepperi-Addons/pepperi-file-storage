import { Request } from "@pepperi-addons/debug-server/dist";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { ICommand, IPepperiDal, IPfsGetter, IPfsMutator, PfsService, PostService } from "pfs-shared";
import { OfflinePostService } from "./offlinePostService";
import { FilesToUploadDal } from "../dal/filesToUploadDal";


export class TemporaryFileUrlPostCommand extends PfsService implements ICommand
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

		return res;
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
