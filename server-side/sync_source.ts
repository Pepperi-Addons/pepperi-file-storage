import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonAPIAsyncResult, AddonData, SearchData } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../addon.config.json";
import { SyncSourceService } from "./sync-source/sync-source.service";
import { ICrawlRequest } from "./sync-source/rebuild-cache/i-crawl-request";
import { CrawlRequest } from "./sync-source/rebuild-cache/crawl-request";
import { ServerHelper } from "./serverHelper";
import { SchemaSearcher } from "./sync-source/rebuild-cache/schema-searcher";
import docDbDal from "./DAL/docDbDal";
import { CrawlingSourceService } from "./sync-source/crawling-source/crawling-source.service";

export async function rebuild_cache(client: Client, request: Request): Promise<AddonAPIAsyncResult> 
{
	const papiClient = ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey);
	const schemaSearcher = new SchemaSearcher(papiClient);
	const crawlRequest: ICrawlRequest = await CrawlRequest.getInstance(request, schemaSearcher);

	const syncSourceService = new SyncSourceService(client, request);
	return await syncSourceService.rebuildCache(crawlRequest);
}

export async function update_cache(client: Client, request: Request): Promise<any> 
{
	const syncSourceService = new SyncSourceService(client, request);
	return await syncSourceService.updateCache();
}

export async function internal_crawler_source(client: Client, request: Request): Promise<SearchData<AddonData>> 
{
	const dal = new docDbDal(ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey));
	const crawlingSourceService = new CrawlingSourceService(dal, request);

	return await crawlingSourceService.getNextPage();
}

export async function internal_crawler_target(client: Client, request: Request): Promise<any> 
{
	throw new Error("Not implemented");
}
