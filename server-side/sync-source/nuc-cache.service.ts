import { PapiClient } from "@pepperi-addons/papi-sdk";

import { CacheUpdateResult, ICacheService, IModifiedObjects } from "./entities";


export class NucCacheService implements ICacheService
{
	protected readonly CRAWLER_ADDON_UUID = "f489d076-381f-4cf7-aa63-33c6489eb017";

	constructor(protected papiClient: PapiClient) 
	{ }

	public async updateCache(modifiedObjects: IModifiedObjects): Promise<CacheUpdateResult[]> 
	{
		return await this.papiClient.post("/cache/changes", modifiedObjects);
	}
}

