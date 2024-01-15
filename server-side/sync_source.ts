import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { SyncSourceService } from "./sync-source/sync-source.service";
import { PnsToModifiedObjectsConverter } from "./sync-source/update-cache/pns-to-modified-objects-converter";

export async function rebuild_cache(client: Client, request: Request): Promise<any> 
{
	throw new Error("Not implemented");
}

export async function update_cache(client: Client, request: Request): Promise<any> 
{
	const pnsToModifiedObjectsConverter = new PnsToModifiedObjectsConverter(request.body);

	const modifiedObjects = pnsToModifiedObjectsConverter.convert();

	const syncSourceService = new SyncSourceService(client, modifiedObjects);
	
	return await syncSourceService.updateCache();
}
