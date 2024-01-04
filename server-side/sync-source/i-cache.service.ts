import { AddonAPIAsyncResult } from "@pepperi-addons/papi-sdk";
import { ICrawlRequest } from "./rebuild-cache/i-crawl-request";
import { CacheUpdateResult, IModifiedObjects } from "./update-cache/i-modified-objects";

export interface ICacheService
{    
    updateCache(modifiedObjects: IModifiedObjects): Promise<CacheUpdateResult[]>;
    crawl(crawlRequest: ICrawlRequest): Promise<AddonAPIAsyncResult>;
}
