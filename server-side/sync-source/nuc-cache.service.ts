import { PapiClient } from "@pepperi-addons/papi-sdk";
import { ICacheService } from "./i-cache.service";
import { IModifiedObjects } from "./update-cache/i-modified-objects";

export class NucCacheService implements ICacheService
{
	constructor(protected papiClient: PapiClient) 
	{ }

	public async updateCache(modifiedObjects: IModifiedObjects): Promise<any> 
	{
		return await this.papiClient.post("/cache/changes", modifiedObjects);
	}
}

