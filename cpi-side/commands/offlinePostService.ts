import { PostService } from "pfs-shared";
import jwtDecode from "jwt-decode";


export class OfflinePostService extends PostService
{
	protected getUploadedByUUID(): Promise<any> 
	{
		return Promise.resolve(jwtDecode(this.OAuthAccessToken)["pepperi.useruuid"]);
	}
}
