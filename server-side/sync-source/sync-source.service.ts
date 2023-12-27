import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { PapiClient } from "@pepperi-addons/papi-sdk";

import { ServerHelper } from "../serverHelper";
import { AddonUUID } from "../../addon.config.json";
import { ICacheService } from "./i-cache.service";
import { NucCacheService } from "./nuc-cache.service";
import { ModifiedObjects } from "./update-cache/modified-objects";
import { IModifiedObjects } from "./update-cache/i-modified-objects";


export class SyncSourceService {
    protected papiClient: PapiClient;
    protected cacheService: ICacheService;

    constructor(protected client: Client, protected request: Request)
    {
        this.papiClient = ServerHelper.createPapiClient(this.client, AddonUUID, this.client.AddonSecretKey);
        this.cacheService = new NucCacheService(this.papiClient);
    }

    public async updateCache(): Promise<any>
    {    
        const modifiedObjects = new ModifiedObjects(this.request);
    
        const isAsync = this.client.isAsync ? this.client.isAsync() : false;
        
        let result;

        try
        {
            result = await this.cacheService.updateCache(modifiedObjects);
        }
        catch (error)
        {
            await this.handleErrorOnUpdateCache(error, isAsync, modifiedObjects);
        }

        return result;
    }

    protected async handleErrorOnUpdateCache(error: unknown, isAsync: boolean, modifiedObjects: ModifiedObjects)
    {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        console.error(`Failed to update cache: ${errorMessage}`);

        if (isAsync)
        {
            await this.setSystemHealthNotification(modifiedObjects, errorMessage);
        }
        else
        {
            throw error;
        }
    }

    protected async setSystemHealthNotification(modifiedObjects: IModifiedObjects, message: string)
	{
		const systemHealthNotificationBody = {
            Name:  `PFS Cache update`,
            Description: `PFS failed to update cache for schema '${modifiedObjects.SchemeName}'.`,
            Status: 'ERROR',
            Message: `Failed to update cache for schema '${modifiedObjects.SchemeName}' with error: ${message}`,
            BroadcastChannel: ['System']
        }

        try
		{
			await this.papiClient.post('/system_health/notifications', systemHealthNotificationBody);
		}
        catch (error)
        {
			// Since PFS doesn't have a dependency on system_health just try to send the error.
			if ((error as Error).message.includes('404 - Not Found error'))
            {
				console.error('Could not find system_health/notifications endpoint, this is probably because the system_health addon is not installed.');
			}
			
			console.error( error instanceof Error ? error.message : 'An unknown error occurred trying to send a system_health notification.');
		}
	}
}