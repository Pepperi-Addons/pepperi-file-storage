import { Client } from "@pepperi-addons/debug-server/dist";
import { AddonData, PapiClient, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";

import { PapiClientBuilder } from "./utilities/papi-client.builder";
import { AddonUUID } from "../../addon.config.json";
import { NucCacheService } from "./nuc-cache.service";
import { ICacheService, IModifiedObjects } from "./entities";
import { DataSearcher } from "./entities/data-searcher";


export class SyncSourceService 
{
	protected papiClient: PapiClient;
	protected cacheService: ICacheService;

	constructor(protected client: Client, protected pepperiDal: DataSearcher)
	{
		const papiClientBuilder = new PapiClientBuilder();
		this.papiClient = papiClientBuilder.build(this.client, AddonUUID, this.client.AddonSecretKey);
		this.cacheService = new NucCacheService(this.papiClient);
	}

	public async updateCache(modifiedObjects: IModifiedObjects): Promise<any>
	{    
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
			await this.handleErrorOnUpdateCache(modifiedObjects, error, isAsync);
		}

		return result;
	}

	/**
 * Set the Hidden field of the modifiedObjects to the up-to-date value.
 * 
 * @param { IModifiedObjects } modifiedObjects - The modifiedObjects to update.
 */
	protected async getUpToDateHiddenFields(modifiedObjects: IModifiedObjects): Promise<void>
	{
		// Filter out objects with defined Hidden field
		const objectsWithHiddenField = modifiedObjects.Updates.filter(update => update.Hidden !== undefined);

		// Retrieve up-to-date Hidden values from the database
		const searchBody: SearchBody = {
			KeyList: objectsWithHiddenField.map(update => update.Key),
			Fields: ["Hidden", "Key", "ModificationDateTime"]
		};
		const upToDateHiddenValues: SearchData<AddonData> = await this.pepperiDal.searchDataInTable(modifiedObjects.SchemeName, searchBody);

		// Create a map of the up-to-date Hidden values for faster lookup
		const upToDateHiddenValuesMap = new Map(upToDateHiddenValues.Objects.map(obj => [obj.Key, obj]));

		// Update the modifiedObjects with up-to-date Hidden and ObjectModificationDateTime values
		modifiedObjects.Updates.forEach(update => 
		{
			const upToDateHiddenObject = upToDateHiddenValuesMap.get(update.Key);

			if (upToDateHiddenObject)
			{
				// Update Hidden field if different
				if (update.Hidden !== upToDateHiddenObject.Hidden)
				{
					update.Hidden = upToDateHiddenObject.Hidden;
				}

				// Update ObjectModificationDateTime if different
				if (update.ObjectModificationDateTime !== upToDateHiddenObject.ModificationDateTime)
				{
					update.ObjectModificationDateTime = upToDateHiddenObject.ModificationDateTime!;
				}
			}
		});
	}

	/**
	 * In case of an error, set a system_health notification if async, otherwise (this is a the first PNS sync call) throw the error.
	 * @param error 
	 * @param isAsync 
	 * @param modifiedObjects 
	 */
	protected async handleErrorOnUpdateCache(modifiedObjects: IModifiedObjects, error: unknown, isAsync: boolean)
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
			Description: `PFS failed to update cache for schema "${modifiedObjects.SchemeName}".`,
			Status: "ERROR",
			Message: `Failed to update cache for schema "${modifiedObjects.SchemeName}", ActionUUID: "${this.client.ActionUUID}" with error: ${message}`,
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
}
