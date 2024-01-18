import { AddonAPIAsyncResult, CrawlerInput } from "@pepperi-addons/papi-sdk";

export interface CacheRebuildRequest {
    IncludedResources?: string[];
    ExcludedResources?: string[];
}

export interface ICrawlService {
    crawl(crawlRequest: CrawlerInput): Promise<AddonAPIAsyncResult>;
}
