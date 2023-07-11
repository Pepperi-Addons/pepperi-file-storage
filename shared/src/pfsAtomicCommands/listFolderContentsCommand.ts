import { SearchBody } from "@pepperi-addons/papi-sdk";
import { ICommand } from "../iCommand";
import PfsService from "../pfs.service";

export class ListFolderContentsCommand extends PfsService implements ICommand 
{

	public async execute(): Promise<any>
	{
		return await this.listFolderContent();
	}

	private async listFolderContent()
	{
		try 
		{
			const requestedFolder = this.request.query.folder.endsWith("/") ? this.request.query.folder : this.request.query.folder + "/"; //handle trailing '/'

			if(this.request.query.folder != "/" && !(await this.getDoesFileExist(requestedFolder))) // The root folder is not created, and therefore isn't listed in the adal table. It is there by default.
			{
				console.error(`Could not find requested folder: '${this.request.query.folder}'.`);

				const err: any = new Error(`Could not find requested folder: ${this.request.query.folder}`);
				err.code = 404;
				throw err;
			}

			const whereClause = `Folder='${requestedFolder}'${(this.request.query && this.request.query.where) ? " AND (" + this.request.query.where + ")" :""}`;
			const searchBody: SearchBody = {
				Where: whereClause
			};
			return await this.pfsGetter.getObjects(searchBody);

		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`Could not list files in folder ${this.request.query.folder}. ${err.message}`);
				throw err;
			}
		}
	}
}
