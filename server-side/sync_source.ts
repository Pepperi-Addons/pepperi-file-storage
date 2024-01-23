import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonAPIAsyncResult, CrawlerSourceOutput } from "@pepperi-addons/papi-sdk";


import { AddonUUID as PfsAddonUUID } from "../addon.config.json";
import { CrawlingSourceService, CrawlingTargetService, ICacheService, InitiateCrawlCommand, NucCacheService, PnsToModifiedObjectsConverter, SyncSourceService } from "pfs-open-sync";
import { ServerHelper } from "./serverHelper";
import docDbDal from "./DAL/docDbDal";

export async function rebuild_cache(client: Client, request: Request): Promise<AddonAPIAsyncResult> 
{
	const papiClient = ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey);

	const shouldKeepActionUUID = false;
	const noActionUUIDPapiClient = ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey, shouldKeepActionUUID);

	const crawlService = new InitiateCrawlCommand(papiClient, noActionUUIDPapiClient, request.body);

	return await crawlService.execute();
}

export async function update_cache(client: Client, request: Request): Promise<any> 
{
	const pnsToModifiedObjectsConverter = new PnsToModifiedObjectsConverter(request.body);

	const modifiedObjects = pnsToModifiedObjectsConverter.convert();


	const papiClient = ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey);

	const pepperiDal = new docDbDal(papiClient);

	const syncSourceService = new SyncSourceService(client, pepperiDal);
	
	return await syncSourceService.updateCache(modifiedObjects);
}

export async function internal_crawler_source(client: Client, request: Request): Promise<CrawlerSourceOutput> 
{
	const dal = new docDbDal(ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey));
	const crawlingSourceService = new CrawlingSourceService(dal, request.body);

	return await crawlingSourceService.getNextPage();
}

export async function internal_crawler_target(client: Client, request: Request): Promise<any> 
{
	const papiClient = ServerHelper.createPapiClient(client, PfsAddonUUID, client.AddonSecretKey);
	const cacheService: ICacheService = new NucCacheService(papiClient);
	const crawlingTargetService = new CrawlingTargetService(cacheService, request.body);

	return await crawlingTargetService.updateCache();
}
