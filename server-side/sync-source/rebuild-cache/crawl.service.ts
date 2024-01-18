import { PapiClient, CrawlerInput, AddonAPIAsyncResult } from "@pepperi-addons/papi-sdk";
import { ICrawlService } from "../entities";

export class CrawlService implements ICrawlService
{
	constructor(protected papiClient: PapiClient) 
	{ }

	public async crawl(crawlRequest: CrawlerInput): Promise<AddonAPIAsyncResult> 
	{
		return await this.papiClient.addons.crawler.crawl(crawlRequest);
	}
}
