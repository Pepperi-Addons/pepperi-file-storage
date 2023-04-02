import { AddonData, FindOptions, PapiClient } from "@pepperi-addons/papi-sdk";
import { IPepperiDal } from "pfs-shared";
import config from '../../addon.config.json';


export default class docDbDal implements IPepperiDal
{
	constructor(private papiClient: PapiClient, private waitForIndex: boolean = false)
	{}

	public async getDataFromTable(tableName: string, findOptions: FindOptions): Promise<AddonData[]>
	{
		return await this.papiClient.addons.data.uuid(config.AddonUUID).table(tableName).find(findOptions);
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
