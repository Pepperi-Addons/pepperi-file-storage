import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonDataScheme, PapiClient, Subscription } from "@pepperi-addons/papi-sdk";
import { pfsSchemaData } from "./constants";
import { Helper } from "./helper";
import config from './../addon.config.json';

export class PfsSchemeService
{
	private schema: AddonDataScheme;

	constructor(private client: Client, private request: Request)
	{
		this.schema = request.body;
		this.request.header = Helper.getLowerCaseHeaders(this.request.header);	
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
		await this.createPfsSchema();

		// Subscribe to Remove events on the PFS's schema
		await this.subscribeToExpiredRecords();

		// Return the client addon's scheme (of type 'pfs') with PFS's default fields.
		return this.getMergedSchema();
	}

	/**
	 * Creates a data scheme with PFS's and client's requested fields.
	 */
	private async createPfsSchema() 
	{
		const pfsMetadataTable = this.getMergedSchema();
		
		// Set the schema's name to pfs_{{addon_uuid}}_{{schema_name}}
		pfsMetadataTable.Name = this.getPfsSchemaName();
		pfsMetadataTable.Type = 'data';

		const papiClient: PapiClient = Helper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);
		return await papiClient.post('/addons/data/schemes', pfsMetadataTable);
	}

	private getPfsSchemaName(): string 
	{
		return Helper.getPfsTableName(this.request.query.addon_uuid, this.schema.Name);
	}

	/**
	 * @returns Return the client addon's scheme (of type 'pfs') with PFS's default fields.
	 */
	private getMergedSchema(): AddonDataScheme
	{
		return {
			...pfsSchemaData,
			...this.schema
		}
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
		const papiClient: PapiClient = Helper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);
		return papiClient.notification.subscriptions.upsert({
			AddonUUID: config.AddonUUID,
			Name: `pfs-expired-records-${this.getPfsSchemaName()}`, // Names of subscriptions should be unique
			Type: "data",
			FilterPolicy: {
				Resource: [this.getPfsSchemaName()],
				Action: ["remove"],
				AddonUUID: [config.AddonUUID]
			},
			AddonRelativeURL: '/api/record_removed',
			Hidden: hidden,
		});
	}

	/**
     * Validate that the schema creation request is valid.
     */
	private async validateSchemaCreationRequest() 
	{
		// Validate that the provided secret key matches the addon's secre key, and that the addon is indeed installed.
		await Helper.validateAddonSecretKey(this.request.header, this.client, this.request.query.addon_uuid);

		// Validate that the requested schema is valid
		this.validateSchema();
	}
	
	private validateSchema(): void 
	{
		this.validateSchemaType();
		this.validateSchemaName();
		this.validateNoCustomFields();
	}

	/**
	 * Validate the the passed schema does not have any custom fields.
	 */
	private validateNoCustomFields()
	{
		if(this.schema.Fields)
		{
			throw new Error("Schema of type 'pfs' cannot have custom fields.");
		}
	}

	/**
     * Validates that the requested schema type is 'pfs'. Throws an excpetion otherwise.
     */
	private validateSchemaType() 
	{
		if (!this.schema || this.schema.Type !== 'pfs') 
		{
			throw new Error("The schema must be of type 'pfs'")
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
	 * Purges the PFS's schema. Purge the PFS's 'data' schema, which deletes the table's records (S3 clean up is done by the subscription to the 'remove' notifications).
	 * All that is left to do is to remove the subscription.
	 */
	public async purge() 
	{
		// Delete the PFS's 'data' schema
		const papiClient = Helper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);
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
		// Since the Remove messages take a while to propegate, we can't unsubscribe immediately.
		// return await this.unsubscribeFromExpiredRecords();
	}
}