import { AddonData, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";
import { IPepperiDal } from "pfs-shared";
import config from '../../addon.config.json';

export default class CpiPepperiDal implements IPepperiDal
{
	public async searchDataInTable(tableName: string, searchBody: SearchBody): Promise<SearchData<AddonData>> 
	{
		return await pepperi.addons.data.uuid(config.AddonUUID).table(tableName).search(searchBody);
	}

	public async postDocumentToTable(tableName: string, document: any): Promise<AddonData>
	{
		return await pepperi.addons.data.uuid(config.AddonUUID).table(tableName).upsert(document);
	}

	public async hardDeleteDocumentFromTable(tableName: string, key: any): Promise<any>
	{
		throw new Error('Hard delete is not supported in CPI-side.');
	}
}
