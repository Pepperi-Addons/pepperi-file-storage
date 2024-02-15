import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonAPIAsyncResult, CrawlerSourceOutput } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../addon.config.json";
import { 
	CrawlingSourceService,
	CrawlingTargetService,
	ICacheService,
	InitiateCrawlCommand,
	NucCacheService,
	SyncSourceService,
	DataSearcher,
	DefaultDataSearcher,
	PapiClientBuilder,
	CacheUpdateErrorHandlingStrategyFactory,
	PnsToCacheRemoveInputConverter,
	PnsToCacheChangesInputConverter
} from "pfs-open-sync";


export async function rebuild_cache(client: Client, request: Request): Promise<AddonAPIAsyncResult> 
{
	const papiClientBuilder = new PapiClientBuilder();
	const papiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey);

	const shouldKeepActionUUID = false;
	const noActionUUIDPapiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey, shouldKeepActionUUID);

	const crawlService = new InitiateCrawlCommand(papiClient, noActionUUIDPapiClient, request.body);

	return await crawlService.execute();
}

export async function update_cache(client: Client, request: Request): Promise<any> 
{
	const papiClientBuilder = new PapiClientBuilder();
	const papiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey);

	const pnsToModifiedObjectsConverter = new PnsToCacheChangesInputConverter();
	const modifiedObjects = pnsToModifiedObjectsConverter.convert(request.body);

	const errorHandler = new CacheUpdateErrorHandlingStrategyFactory().create(client, request.body); 

	const syncSourceService = new SyncSourceService(papiClient, errorHandler);
	
	return await syncSourceService.updateCache(modifiedObjects);
}

export async function remove_from_cache(client: Client, request: Request): Promise<any> 
{
	const papiClientBuilder = new PapiClientBuilder();
	const papiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey);

	const pnsToCacheRemoveInputConverter = new PnsToCacheRemoveInputConverter();
	const removedObjects = pnsToCacheRemoveInputConverter.convert(request.body);

	const errorHandler = new CacheUpdateErrorHandlingStrategyFactory().create(client, request.body); 

	const syncSourceService = new SyncSourceService(papiClient, errorHandler);
	
	return await syncSourceService.removeFromCache(removedObjects);
}

export async function internal_crawler_source(client: Client, request: Request): Promise<CrawlerSourceOutput> 
{
	const papiClientBuilder = new PapiClientBuilder();
	const papiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey);

	const dataSearcher: DataSearcher = new DefaultDataSearcher(papiClient);

	const crawlingSourceService = new CrawlingSourceService(request.body, dataSearcher);

	return await crawlingSourceService.getNextPage();
}

export async function internal_crawler_target(client: Client, request: Request): Promise<any> 
{
	const papiClientBuilder = new PapiClientBuilder();
	const papiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey);

	const cacheService: ICacheService = new NucCacheService(papiClient);

	const crawlingTargetService = new CrawlingTargetService(cacheService, request.body);

	return await crawlingTargetService.updateCache();
}
