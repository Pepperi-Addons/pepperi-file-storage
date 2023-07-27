import { AddonData, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";
import { IFetchCommand } from "../iFetchCommand";
import PfsService from "../pfs.service";

export class ListFolderContentsCommand extends PfsService implements IFetchCommand 
{

	public async execute(): Promise<SearchData<AddonData>>
	{
		return await this.listFolderContent();
	}

	private async listFolderContent(): Promise<SearchData<AddonData>>
	{
		const requestedFolder = this.request.query.folder.endsWith("/") ? this.request.query.folder : this.request.query.folder + "/"; //handle trailing '/'

		if(this.request.query.folder != "/" && !(await this.getDoesFileExist(requestedFolder))) // The root folder is not created, and therefore isn't listed in the adal table. It is there by default.
		{
			const errorMessage = `Could not list files in folder ${this.request.query.folder}. Could not find requested folder: '${this.request.query.folder}'.`;
			console.error(errorMessage);

			const err: any = new Error(errorMessage);
			err.code = 404;
			throw err;
		}

		const whereClause = `Folder='${requestedFolder}'${(this.request.query && this.request.query.where) ? " AND (" + this.request.query.where + ")" :""}`;
		const searchBody: SearchBody = {
			Where: whereClause
		};
		
		return await this.pfsGetter.getObjects(searchBody);
	}
}
