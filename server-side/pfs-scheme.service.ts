import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonDataScheme, PapiClient, Relation, Subscription } from "@pepperi-addons/papi-sdk";
import config from "./../addon.config.json";
import { ServerHelper } from "./serverHelper";
import { pfsSchemaData, SharedHelper } from "pfs-shared";

export class PfsSchemeService
{
	private schema: AddonDataScheme;

	constructor(private client: Client, private request: Request)
	{
		this.schema = request.body;
		this.request.header = ServerHelper.getLowerCaseHeaders(this.request.header);	
	}

	/**
     * Create a new 'data' typed schema for the PFS use, and subscribe to 'remove' events.
	 * Return the client addon's scheme (of type 'pfs') with PFS's default fields.
     * @returns Return the client addon's scheme (of type 'pfs') with PFS's default fields.
     */
	public async create(): Promise<AddonDataScheme> 
	{
		await this.validateSchemaCreationRequest();

		// Create a data schema for the PFS's fields.
		const internalDataSchema = await this.createPfsSchema();

		// Create a Resource Import relation 
		await this.createResourceImportRelation(internalDataSchema.Name, this.schema.Name);

		// Subscribe to Remove events on the PFS's schema
		await this.subscribeToExpiredRecords();

		//Subscribe to update/insert events on the PFS's schema
		await this.subscribeToUpsertedRecords();

		// Return the client addon's scheme (of type 'pfs') with PFS's default fields.
		// return this.getMergedSchema();
		const res = this.getMergedSchema();

		return res;
	}

	/**
	 * Create a Resource Import relation for the given schema.
	 * @param internalDataSchemaName The name of the internal data schema to create the relation for.
	 * @param externalPfsSchemaName The name of the external PFS schema to create the relation for.
	 * @returns {Promise<Relation>} A promise that resolves to the created relation.
	 * @throws {Error} If the relation creation fails.
	 * @remarks For more details see: https://pepperi.atlassian.net/browse/DI-24901
	 */
	public async createResourceImportRelation(internalDataSchemaName: string, externalPfsSchemaName: string): Promise<Relation>
	{
		const relation: Relation = {
			Name: internalDataSchemaName,
			AddonUUID: config.AddonUUID,
			Type: "AddonAPI",
			RelationName: "DataImportResource",
			AddonRelativeURL: `/api/resource_import?addon_uuid=${this.request.query.addon_uuid}&resource_name=${externalPfsSchemaName}`,
		};

		const papiClient: PapiClient = ServerHelper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);
		return await papiClient.addons.data.relations.upsert(relation);
	}

	/**
	 * Creates a data scheme with PFS's and client's requested fields.
	 */
	private async createPfsSchema(): Promise<AddonDataScheme>
	{
		const pfsMetadataTable = this.getMergedSchema();
		
		// Set the schema's name to pfs_{{addon_uuid}}_{{schema_name}}
		pfsMetadataTable.Name = this.getPfsSchemaName();
		pfsMetadataTable.Type = "data";

		const papiClient: PapiClient = ServerHelper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);

		const resultingSchema = await papiClient.addons.data.schemes.post(pfsMetadataTable);
		console.log(`Created schema ${resultingSchema.Name} with fields: ${JSON.stringify(resultingSchema.Fields)}`);
		return resultingSchema;
	}

	private getPfsSchemaName(): string 
	{
		return SharedHelper.getPfsTableName(this.request.query.addon_uuid, this.schema.Name);
	}

	/**
	 * @returns Return the client addon's scheme (of type 'pfs') with PFS's default fields.
	 */
	private getMergedSchema(): AddonDataScheme
	{
		const schemaCopy = JSON.parse(JSON.stringify(this.schema));

		// Remove any Index property from the schemaCopy Fields object
		// This is for DI-23567. For more info, see https://pepperi.atlassian.net/browse/DI-23567
		if(schemaCopy.Fields)
		{
			Object.keys(schemaCopy.Fields).forEach(key => 
			{
				delete schemaCopy.Fields[key].Indexed;
			});
		}

		return {
			...schemaCopy,
			...pfsSchemaData,
		};
	}

	private async subscribeToExpiredRecords(): Promise<Subscription>
	{
		const shouldHideSubscription = false;
		return this.expiredRecordsSubscription(shouldHideSubscription);
	}

	private async unsubscribeFromExpiredRecords(): Promise<Subscription>
	{
		const shouldHideSubscription = true;
		return this.expiredRecordsSubscription(shouldHideSubscription);
	}

	private async expiredRecordsSubscription(hidden: boolean): Promise<Subscription> 
	{
		const papiClient: PapiClient = ServerHelper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);
		return await papiClient.notification.subscriptions.upsert({
			AddonUUID: config.AddonUUID,
			Name: `pfs-expired-records-${this.getPfsSchemaName()}`, // Names of subscriptions should be unique
			Type: "data",
			FilterPolicy: {
				Resource: [this.getPfsSchemaName()],
				Action: ["remove"],
				AddonUUID: [config.AddonUUID]
			},
			AddonRelativeURL: "/api/record_removed",
			Hidden: hidden,
		});
	}

	public async subscribeToUpsertedRecords(schema: AddonDataScheme = this.schema)
	{
		if(schema.SyncData?.Sync)
		{
			const papiClient: PapiClient = ServerHelper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);
			return await papiClient.notification.subscriptions.upsert({
				AddonUUID: config.AddonUUID,
				Name: `pfs-upserted-records-${schema.Name}`, // Names of subscriptions should be unique
				Type: "data",
				FilterPolicy: {
					Resource: [schema.Name],
					Action: ["insert", "update"],
					AddonUUID: [config.AddonUUID]
				},
				AddonRelativeURL: "/sync_source/update_cache",
			});
		}
	}

	/**
     * Validate that the schema creation request is valid.
     */
	private async validateSchemaCreationRequest() 
	{
		// Validate that the provided secret key matches the addon's secre key, and that the addon is indeed installed.
		await ServerHelper.validateAddonSecretKey(this.request.header, this.client, this.request.query.addon_uuid);

		// Validate that the requested schema is valid
		await this.validateSchema();
	}
	
	private async validateSchema(): Promise<void> 
	{
		this.validateSchemaType();
		this.validateSchemaName();
		this.validateNoIndexedCustomFields();
	}

	/**
     * Validates that the requested schema type is 'pfs'. Throws an exception otherwise.
     */
	private validateSchemaType() 
	{
		if (!this.schema || this.schema.Type !== "pfs") 
		{
			throw new Error("The schema must be of type 'pfs'");
		}
	}

	private validateSchemaName() 
	{
		if (!this.schema || !this.schema.Name) 
		{
			throw new Error("The schema must have a Name property");
		}
	}

	/**
	 * Validates that no passed fields contain an Indexed property, which is no supported
	 * For more details see: 
	 * - https://pepperi.atlassian.net/browse/DI-23567
	 * - https://pepperi.atlassian.net/browse/DI-23700
	 */
	validateNoIndexedCustomFields()
	{
		if(this.schema.Fields)
		{
			const doesHaveIndexedFields = Object.keys(this.schema.Fields).some(field => Object.keys(field).includes("Indexed"));
			
			if(doesHaveIndexedFields)
			{
				throw new Error("The use of Indexed fields is not supported. Do not pass an Indexed property for any schema field.");
			}
		}
	}

	/**
	 * Purges the PFS's schema. Purge the PFS's 'data' schema, which deletes the table's records (S3 clean up is done by the subscription to the 'remove' notifications).
	 * All that is left to do is to remove the subscription.
	 */
	public async purge() 
	{
		// Delete the PFS's 'data' schema
		const papiClient = ServerHelper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);
		try
		{
			await papiClient.post(`/addons/data/schemes/${this.getPfsSchemaName()}/purge`);
		}
		catch(error)
		{
			if(error instanceof Error)
			{
				return { success: false, errorMessage: error.message };
			}
		}

		return { success: true };

		// Unsubscribe from the PFS's 'remove' notifications
		// Since the Remove messages take a while to propagate, we can't unsubscribe immediately.
		// return await this.unsubscribeFromExpiredRecords();
	}
}
