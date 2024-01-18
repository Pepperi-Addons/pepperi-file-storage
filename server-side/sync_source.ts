import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonAPIAsyncResult, AddonData, SearchData } from "@pepperi-addons/papi-sdk";

import { PnsToModifiedObjectsConverter } from "./sync-source/update-cache/pns-to-modified-objects-converter";
import { AddonUUID as PfsAddonUUID } from "../addon.config.json";
import { SyncSourceService } from "./sync-source/sync-source.service";
import { CrawlRequest } from "./sync-source/rebuild-cache/crawl-request.builder";
import { ServerHelper } from "./serverHelper";
import { SchemaSearcher } from "./sync-source/rebuild-cache/schema-searcher";
import docDbDal from "./DAL/docDbDal";
import { CrawlingSourceService} from "./sync-source/handle-crawling/crawling-source.service";
import { CrawlingTargetService } from "./sync-source/handle-crawling/crawling-target.service";
import { ICacheService } from "./sync-source/i-cache.service";
import { NucCacheService } from "./sync-source/nuc-cache.service";

export async function rebuild_cache(client: Client, request: Request): Promise<AddonAPIAsyncResult> 
{
	const papiClient = ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey);
	const schemaSearcher = new SchemaSearcher(papiClient);

	const crawlRequestBuilder = new CrawlRequest(request.body, schemaSearcher);
	const crawlRequest = await crawlRequestBuilder.build();

	const syncSourceService = new SyncSourceService(client);
	return await syncSourceService.rebuildCache(crawlRequest);
}

export async function update_cache(client: Client, request: Request): Promise<any> 
{
	const pnsToModifiedObjectsConverter = new PnsToModifiedObjectsConverter(request.body);

	const modifiedObjects = pnsToModifiedObjectsConverter.convert();

	const syncSourceService = new SyncSourceService(client);
	
	return await syncSourceService.updateCache(modifiedObjects);
}

export async function internal_crawler_source(client: Client, request: Request): Promise<SearchData<AddonData>> 
{
	const dal = new docDbDal(ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey));
	const crawlingSourceService = new CrawlingSourceService(dal, request);

	return await crawlingSourceService.getNextPage();
}

export async function internal_crawler_target(client: Client, request: Request): Promise<any> 
{
	const papiClient = ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey);
	const cacheService: ICacheService = new NucCacheService(papiClient);
	const crawlingTargetService = new CrawlingTargetService(cacheService, request);

	return await crawlingTargetService.updateCache();
}
