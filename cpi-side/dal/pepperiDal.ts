import { AddonData, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";
import { IPepperiDal } from "pfs-shared";
import config from "../../addon.config.json";

export default class CpiPepperiDal implements IPepperiDal
{
	public async searchDataInTable(tableName: string, searchBody: SearchBody): Promise<SearchData<AddonData>> 
	{
		let res: SearchData<AddonData>;
		// if searchbody.KeyList.length === 1 we can use the get by key method instead of search
		// This distinction is done to avoid the overhead of a search request when we know we're getting a single object
		if(searchBody.KeyList?.length === 1)
		{
			res = await this.getByKeyFromTable(tableName, searchBody.KeyList[0]);
		}
		else
		{
			res = await pepperi.addons.data.uuid(config.AddonUUID).table(tableName).search(searchBody);
		}

		return res;
	}

	private async getByKeyFromTable(tableName: string, key: string): Promise<SearchData<AddonData>>
	{
		const requestItem = await pepperi.addons.data.uuid(config.AddonUUID).table(tableName).key(key).get() as AddonData;

		const res: SearchData<AddonData> = { Objects: [requestItem], Count: 1 };
		
		return res;
	}

	public async postDocumentToTable(tableName: string, document: any): Promise<AddonData>
	{
		return await pepperi.addons.data.uuid(config.AddonUUID).table(tableName).upsert(document);
	}

	public async hardDeleteDocumentFromTable(tableName: string, key: any): Promise<any>
	{
		throw new Error("Hard delete is not supported in CPI-side.");
	}
}
