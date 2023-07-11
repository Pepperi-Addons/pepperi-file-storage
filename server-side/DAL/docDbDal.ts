import { AddonData, PapiClient, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";
import { IPepperiDal } from "pfs-shared";
import config from "../../addon.config.json";


export default class docDbDal implements IPepperiDal
{
	constructor(private papiClient: PapiClient, private waitForIndex: boolean = false)
	{}

	public async searchDataInTable(tableName: string, searchBody: SearchBody): Promise<SearchData<AddonData>>
	{
		return await this.papiClient.addons.data.search.uuid(config.AddonUUID).table(tableName).post(searchBody);
	}

	public async postDocumentToTable(tableName: string, document: any): Promise<AddonData>
	{
		return await this.papiClient.addons.data.uuid(config.AddonUUID).table(tableName).upsert(document, this.waitForIndex);
	}

	public async hardDeleteDocumentFromTable(tableName: string, key: any): Promise<any>
	{
		return await this.papiClient.addons.data.uuid(config.AddonUUID).table(tableName).key(key).hardDelete(true);
	}
}
