import { AddonData, SearchData } from "@pepperi-addons/papi-sdk";
import { IFetchCommand } from "../iFetchCommand";
import PfsService from "../pfs.service";


export class ListObjectsCommand extends PfsService implements IFetchCommand 
{

	public async execute(): Promise<SearchData<AddonData>>
	{
		return await this.listObjects();
	}

	private async listObjects()
	{
		return await this.pfsGetter.getObjects();
	}
}
