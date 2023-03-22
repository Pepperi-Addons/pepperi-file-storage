import { AddonsDataSearchParams } from "@pepperi-addons/cpi-node/build/cpi-side/client-api";
import { AddonData, FindOptions } from "@pepperi-addons/papi-sdk";
import { IPepperiDal } from "pfs-shared";
import config from '../../addon.config.json';

export default class CpiPepperiDal implements IPepperiDal
{
	public async getDataFromTable(tableName: string, findOptions: FindOptions): Promise<AddonData[]>
	{
		const addonsDataSearchParams: AddonsDataSearchParams = {
			...(findOptions.where && {Where: findOptions.where}),
			...(findOptions.page_size && {PageSize: findOptions.page_size}),
			...(findOptions.fields && {Fields: findOptions.fields}),
			...(findOptions.page && {Page: findOptions.page}),
			...(findOptions.order_by && {SortBy: findOptions.order_by})
		};

		const res = await pepperi.addons.data.uuid(config.AddonUUID).table(tableName).search(addonsDataSearchParams);
		return res.Objects;
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
