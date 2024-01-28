import { AddonAPIAsyncResult, CrawlerInput, CrawlerSourceInput } from "@pepperi-addons/papi-sdk";

export interface CacheRebuildRequest {
    IncludedResources?: string[];
    ExcludedResources?: string[];
}

export interface ICrawlService {
    crawl(crawlRequest: CrawlerInput): Promise<AddonAPIAsyncResult>;
}

export interface PfsCrawlerSourceInput extends CrawlerSourceInput
{
    SchemaNames: string[];
}
