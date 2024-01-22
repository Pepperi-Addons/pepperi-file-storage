import { PapiClient, AddonAPIAsyncResult } from "@pepperi-addons/papi-sdk";
import { CacheRebuildRequest } from "../entities";
import { SchemaSearcher } from "./schema-searcher";
import { CrawlRequestBuilder } from "./crawl-request.builder";

export class InitiateCrawlCommand
{
	protected schemaSearcher: SchemaSearcher;
	protected crawlRequestBuilder: CrawlRequestBuilder;

	
	/**
     * @param {PapiClient} papiClient - Will be used to make the synchronous api calls. 
     * @param {PapiClient} asyncPapiClient - Will be used to make the async api calls. The actionUUID should 
     * not be initialized, since the crawl request is asynchronous.
     **/
	constructor(protected papiClient: PapiClient, protected asyncPapiClient: PapiClient, protected cacheRebuildRequest: CacheRebuildRequest) 
	{ 
		this.schemaSearcher = new SchemaSearcher(papiClient);
		this.crawlRequestBuilder = new CrawlRequestBuilder(this.cacheRebuildRequest, this.schemaSearcher);

	}

	public async execute(): Promise<AddonAPIAsyncResult> 
	{
		const crawlRequest = await this.crawlRequestBuilder.build();
		const crawlResponse = await this.asyncPapiClient.addons.crawler.crawl(crawlRequest);
		
		console.log("Crawl was initiated to rebuild the cache. For more information, See ActionUUID:",  crawlResponse.ExecutionUUID);

		return crawlResponse;
	}
}
