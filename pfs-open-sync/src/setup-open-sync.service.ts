import { AddonDataScheme, Subscription, PapiClient, AddonAPIAsyncResult } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../addon.config.json";
import { InitiateCrawlCommand } from "./rebuild-cache/initiate-crawl.command";
import { CacheRebuildRequest } from "./entities";
import { SchemaSearcher } from "./rebuild-cache/schema-searcher";


/**
 * Sets up any resources needed for Open Sync support:
 * Register to PNSs, upsert the schema to the sync cache, initialize the sync cache, etc.
 */
export class SetupOpenSyncService
{
	constructor(protected papiClient: PapiClient)
	{ }


	public async setupSyncSource(asyncPapiClient: PapiClient): Promise<AddonAPIAsyncResult>
	{
		const syncableSchemas: AddonDataScheme[] = await this.getSchemas();
		
		for (const dataTypedSchema of syncableSchemas)
		{
			await this.createOpenSyncResourcesForSchema(dataTypedSchema);
		}

		return await this.initializeSyncCache(asyncPapiClient);
	}

	public async destructSyncSource(): Promise<void>
	{
		const syncableSchemas: AddonDataScheme[] = await this.getSchemas();
		
		for (const dataTypedSchema of syncableSchemas)
		{
			await this.unsubscribeFromUpsertedRecords(dataTypedSchema);
			await this.unsubscribeFromRemovedRecords(dataTypedSchema);
			await this.removeSchemaFromSyncCache(dataTypedSchema);
		}
	}
	protected async getSchemas(): Promise<AddonDataScheme[]>
	{
		const schemaSearcher = new SchemaSearcher(this.papiClient);
		const requiredFields = ["Name", "SyncData"];
		const schemas = await schemaSearcher.searchSchemas(requiredFields);

		return schemas;
	}
	/**
	 * Set up any resources needed to sync the schema.
	 * 
	 * If SyncData.Sync == true && SyncData.SyncRecords !== false,
     * subscribes to upserted records on the PFS's schema, and upserts
     *  the schema to the sync cache.
	 * @returns {Promise<void>}
	 */
	public async createOpenSyncResourcesForSchema(dataTypedSchema: AddonDataScheme): Promise<void>
	{	
		// SyncRecords is true by default, so we need to validate it isn't false.
		if(dataTypedSchema.SyncData?.Sync && dataTypedSchema.SyncData.SyncRecords !== false)
		{
			await this.subscribeToUpsertedRecords(dataTypedSchema);
			await this.subscribeToRemovedRecords(dataTypedSchema);
			await this.upsertSchemaToSyncCache(dataTypedSchema);
		}	
	}

	/**
	 * Subscribe to removed records on the PFS's schema.
	 * @returns {Promise<void>}
	 */
	protected async subscribeToRemovedRecords(dataTypedSchema: AddonDataScheme): Promise<Subscription>
	{
		return await this.papiClient.notification.subscriptions.upsert({
			AddonUUID: PfsAddonUUID,
			Name: `pfs-removed-records-${dataTypedSchema.Name}`, // Names of subscriptions should be unique
			Type: "data",
			FilterPolicy: {
				Resource: [dataTypedSchema.Name],
				Action: ["remove"],
				AddonUUID: [PfsAddonUUID]
			},
			AddonRelativeURL: `/sync_source/remove_from_cache?resource_name=${dataTypedSchema.Name}`,
		});
	}

	/**
	 * Subscribe to upserted records on the PFS's schema.
	 * @returns {Promise<void>}
	 */
	protected async subscribeToUpsertedRecords(dataTypedSchema: AddonDataScheme): Promise<Subscription>
	{
		return await this.papiClient.notification.subscriptions.upsert({
			AddonUUID: PfsAddonUUID,
			Name: `pfs-upserted-records-${dataTypedSchema.Name}`, // Names of subscriptions should be unique
			Type: "data",
			FilterPolicy: {
				Resource: [dataTypedSchema.Name],
				Action: ["insert", "update"],
				AddonUUID: [PfsAddonUUID]
			},
			AddonRelativeURL: `/sync_source/update_cache?resource_name=${dataTypedSchema.Name}`,
		});
	}

	/**
	 * Upsert the schema to the sync cache.
	 * @returns {Promise<void>}
	 */
	protected async upsertSchemaToSyncCache(dataTypedSchema: AddonDataScheme): Promise<void>
	{
		const syncCacheSchema = {
			// Both SourceAddonUUID and SchemeAddonUUID should be the PFS's addon UUID
			// This is due to the fact that the schemas are owned by the PFS, and not by the client addon.
			SchemeAddonUUID: PfsAddonUUID,
			SourceAddonUUID: PfsAddonUUID,
			SchemeName: dataTypedSchema.Name,
		};

		try
		{
			await this.papiClient.post(`/cache/schemes`, syncCacheSchema);
		}
		catch(error)
		{
			const errorMessage = `Failed to upsert schema to sync cache. Error: ${error instanceof Error ? error.message : error}`;
			console.error(errorMessage);
			throw new Error(errorMessage); // Should we throw an error here, or just log it?
		}
	}

	/**
     * Unsubscribe from upserted records on the PFS's schema.
     * @returns {Promise<void>}
     */
	protected async unsubscribeFromUpsertedRecords(dataTypedSchema: AddonDataScheme)
	{
		const subscriptions = await this.papiClient.notification.subscriptions.find({
			where: `Name LIKE 'pfs-upserted-records-${dataTypedSchema.Name}'`
		});

		for (const subscription of subscriptions)
		{
			subscription.Hidden = true;
			await this.papiClient.notification.subscriptions.upsert(subscription);
		}
	}

	/**
     * Unsubscribe from removed records on the PFS's schema.
     * @returns {Promise<void>}
     */
	protected async unsubscribeFromRemovedRecords(dataTypedSchema: AddonDataScheme): Promise<void>
	{
		const subscriptions = await this.papiClient.notification.subscriptions.find({
			where: `Name LIKE 'pfs-removed-records-${dataTypedSchema.Name}'`
		});

		for (const subscription of subscriptions)
		{
			subscription.Hidden = true;
			await this.papiClient.notification.subscriptions.upsert(subscription);
		}
	}

	/**
     * Remove the schema from the sync cache.
     */
	protected async removeSchemaFromSyncCache(dataTypedSchema: AddonDataScheme)
	{
		const syncCacheSchema = {
			SchemeAddonUUID: PfsAddonUUID,
			SourceAddonUUID: PfsAddonUUID,
			SchemeName: dataTypedSchema.Name,
		};

		await this.papiClient.post(`/cache/purge`, syncCacheSchema);
	}

	/**
	 * Initialize the sync cache for all the schemas that are synced by the PFS.
	 */
	public async initializeSyncCache(asyncPapiClient: PapiClient): Promise<AddonAPIAsyncResult>
	{
		const cacheRebuildRequest: CacheRebuildRequest = {}; // Rebuild all syncable resources 
		const initiateCrawlCommand = new InitiateCrawlCommand(this.papiClient, asyncPapiClient, cacheRebuildRequest);

		return await initiateCrawlCommand.execute();
	}
    
}
