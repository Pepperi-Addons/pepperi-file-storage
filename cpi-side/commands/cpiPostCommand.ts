import { PapiClient } from "@pepperi-addons/papi-sdk";
import { ICommand, PfsService, PostService } from "pfs-shared";
import { OfflinePostService } from "./offlinePostService";

export class CpiPostCommand extends PfsService implements ICommand
{
	public async execute(): Promise<any> 
	{
		const postService = await this.getPostService();

		postService.validatePostRequest();

		// Download the current saved metadata, if exists
		await postService.getCurrentItemData();

		// Further validation of input
		await postService.validateFieldsForUpload();

		// Commit changes to S3 and ADAL metadata table
		const res: any = await postService.mutatePfs();

		return res;

	}

	private async getPostService(): Promise<PostService>
	{
		const papiClient: PapiClient = await pepperi.papiClient;
		const token: string = await pepperi.auth.getAccessToken();
		return new OfflinePostService(papiClient, token, this.request, this.pfsMutator, this.pfsGetter);
	}
}