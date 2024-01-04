import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonAPIAsyncResult, AddonData, PapiClient, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";

import { ServerHelper } from "../serverHelper";
import { AddonUUID } from "../../addon.config.json";
import { ICacheService } from "./i-cache.service";
import { NucCacheService } from "./nuc-cache.service";
import { IModifiedObjects } from "./update-cache/i-modified-objects";
import docDbDal from "../DAL/docDbDal";
import { ModifiedObjects } from "./update-cache/modified-objects";
import { ICrawlRequest } from "./rebuild-cache/i-crawl-request";


export class SyncSourceService 
{
	protected papiClient: PapiClient;
	protected cacheService: ICacheService;
	protected pepperiDal: docDbDal;

	constructor(protected client: Client, protected request: Request, pepperiDal?: docDbDal)
	{
		this.papiClient = ServerHelper.createPapiClient(this.client, AddonUUID, this.client.AddonSecretKey);
		this.cacheService = new NucCacheService(this.papiClient);
		this.pepperiDal = pepperiDal || new docDbDal(this.papiClient);
	}

	public async updateCache(): Promise<any>
	{    
		const modifiedObjects: IModifiedObjects = new ModifiedObjects(this.request);

		// modifiedObject that has a Hidden field should be validated against the actual schema's data,
		// to ensure the latest value of the Hidden field is used.
		await this.getUpToDateHiddenFields(modifiedObjects);
    
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

	/**
     * Set the Hidden field of the modifiedObjects to the up to date value.
     * 
     * @param { ModifiedObjects } modifiedObjects - The modifiedObjects to update.
     */
	protected async getUpToDateHiddenFields(modifiedObjects: IModifiedObjects): Promise<void>
	{
		const objectsWithHiddenField = modifiedObjects.Updates.filter(update => update.Hidden !== undefined);

		const searchBody: SearchBody = {
			KeyList: objectsWithHiddenField.map((update) => update.Key),
			Fields: ["Hidden", "Key"]
		};

		const upToDateHiddenValues: SearchData<AddonData> = await this.pepperiDal.searchDataInTable(modifiedObjects.SchemeName, searchBody);

		// Create a map of the up to date Hidden values.
		// This is just to make it faster to find the up to date Hidden value for a given object.
		const upToDateHiddenValuesMap = new Map(upToDateHiddenValues.Objects.map((obj) => [obj.Key, obj.Hidden]));

		// Update the modifiedObjects with the up to date Hidden values.
		modifiedObjects.Updates.map((update) => 
		{
			if (update.Hidden !== upToDateHiddenValuesMap.get(update.Key))
			{
				update.Hidden = upToDateHiddenValuesMap.get(update.Key);
			}

			return update;
		});
	}

	protected async handleErrorOnUpdateCache(error: unknown, isAsync: boolean, modifiedObjects: IModifiedObjects)
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
			Status: "ERROR",
			Message: `Failed to update cache for schema '${modifiedObjects.SchemeName}' with error: ${message}`,
			BroadcastChannel: ["System"]
		};

		try
		{
			await this.papiClient.post("/system_health/notifications", systemHealthNotificationBody);
		}
		catch (error)
		{
			// Since PFS doesn't have a dependency on system_health just try to send the error.
			if ((error as Error).message.includes("404 - Not Found error"))
			{
				console.error("Could not find system_health/notifications endpoint, this is probably because the system_health addon is not installed.");
			}
			
			console.error( error instanceof Error ? error.message : "An unknown error occurred trying to send a system_health notification.");
		}
	}

	public async rebuildCache(crawlRequest: ICrawlRequest): Promise<AddonAPIAsyncResult>
	{
		return await this.cacheService.crawl(crawlRequest);
	}
}
