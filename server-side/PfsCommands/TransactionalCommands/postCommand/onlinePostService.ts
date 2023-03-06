import { PostService } from "pfs-shared";
import jwtDecode from 'jwt-decode';

export class OnlinePostService extends PostService
{
    protected async getUploadedByUUID(): Promise<any> 
    {
		const userId = jwtDecode(this.OAuthAccessToken)["pepperi.id"];
		const isSupportAdminUser: boolean = (await this.papiClient.get(`/users/${userId}?fields=IsSupportAdminUser`)).IsSupportAdminUser;

		//Leave files uploaded by support admin user (i.e. uploading using integration) with a blank 
		return isSupportAdminUser ? '' : jwtDecode(this.OAuthAccessToken)['pepperi.useruuid'];
	}
    
}