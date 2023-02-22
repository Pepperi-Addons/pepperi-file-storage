import { PostService } from "pfs-shared";

export class OfflinePostService extends PostService
{
	protected getUploadedByUUID(): Promise<any> 
	{
		return Promise.resolve(this.OAuthAccessToken["pepperi.id"]);
	}
}
