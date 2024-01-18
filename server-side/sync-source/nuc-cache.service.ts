import { PapiClient } from "@pepperi-addons/papi-sdk";

import { CacheUpdateResult, ICacheService, IModifiedObjects } from "./entities";


export class NucCacheService implements ICacheService
{
	constructor(protected papiClient: PapiClient) 
	{ }

	public async updateCache(modifiedObjects: IModifiedObjects): Promise<CacheUpdateResult[]> 
	{
		return await this.papiClient.post("/cache/changes", modifiedObjects);
	}
}

