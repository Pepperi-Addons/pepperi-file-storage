import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { SyncSourceService } from "./sync-source/sync-source.service";

export async function rebuild_cache(client: Client, request: Request): Promise<any> 
{
	throw new Error('Not implemented');
}

export async function update_cache(client: Client, request: Request): Promise<any> 
{
	const syncSourceService = new SyncSourceService(client, request);
	return await syncSourceService.updateCache();
}
