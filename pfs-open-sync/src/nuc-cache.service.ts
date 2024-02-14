import { PapiClient, CacheUpdateResult, CacheChangesInput, CacheRemoveInput } from "@pepperi-addons/papi-sdk";

import { ICacheService } from "./entities";


export class NucCacheService implements ICacheService
{
	constructor(protected papiClient: PapiClient) 
	{ }
	public async removeEntries(removedObjects: CacheRemoveInput): Promise<CacheUpdateResult[]>
	{
		return await this.papiClient.post("/cache/remove", removedObjects);
	}

	public async updateCache(modifiedObjects: CacheChangesInput): Promise<CacheUpdateResult[]> 
	{
		return await this.papiClient.post("/cache/changes", modifiedObjects);
	}
}

