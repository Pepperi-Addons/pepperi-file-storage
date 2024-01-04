import { AddonAPIAsyncResult, PapiClient } from "@pepperi-addons/papi-sdk";

import { ICacheService } from "./i-cache.service";
import { CacheUpdateResult, IModifiedObjects } from "./update-cache/i-modified-objects";
import { ICrawlRequest } from "./rebuild-cache/i-crawl-request";

export class NucCacheService implements ICacheService
{
protected readonly CRAWLER_ADDON_UUID = "f489d076-381f-4cf7-aa63-33c6489eb017";

	constructor(protected papiClient: PapiClient) 
	{ }

	public async updateCache(modifiedObjects: IModifiedObjects): Promise<CacheUpdateResult[]> 
	{
		return await this.papiClient.post("/cache/changes", modifiedObjects);
	}

	public async crawl(crawlRequest: ICrawlRequest): Promise<AddonAPIAsyncResult> 
	{
		return await this.papiClient.post(`/addons/api/${this.CRAWLER_ADDON_UUID}/api/crawl`, crawlRequest);
	}
}

