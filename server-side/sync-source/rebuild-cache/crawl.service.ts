import { PapiClient, CrawlerInput, AddonAPIAsyncResult } from "@pepperi-addons/papi-sdk";
import { ICrawlService } from "../entities";

export class CrawlService implements ICrawlService
{
	/**
     * 
     * @param {PapiClient} papiClient - Will be used to make the api calls. The actionUUID should 
     * not be initialized, since the crawl request is asynchronous.
     **/
	constructor(protected papiClient: PapiClient) 
	{ }

	public async crawl(crawlRequest: CrawlerInput): Promise<AddonAPIAsyncResult> 
	{
		return await this.papiClient.addons.crawler.crawl(crawlRequest);
	}
}
