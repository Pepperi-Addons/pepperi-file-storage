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
     * Add PFS's fields to the client's schem, and create a new 'data' typed schema for the PFS use.
     * @returns the client addon's 'pfs' typed schema after the PFS's fields addition.
     */
	public async create(): Promise<AddonDataScheme> 
	{
		await this.validateSchemaCreationRequest();

		// Upsert the client's schema as requested by the client, adding PFS's default fields and indices.
		const clientSchemaUpsertRes = this.upsertClientSchemaWithPfsFields();

		// Create a data scheme for the PFS's fields.
		const pfsSchema = await this.createPfsSchema();

		// Subscribe to Remove events on the PFS's schema
		await this.subscribeToExpiredRecords();

		return clientSchemaUpsertRes;
	}

	/**
	 * Creates a data scheme with PFS's and client's requested fields.
	 */
	private async createPfsSchema() 
	{
		const pfsMetadataTable = {
			...pfsSchemaData,
			...this.schema
		};
		
		// Set the schema's name to pfs_{{addon_uuid}}_{{schema_name}}
		pfsMetadataTable.Name = this.getPfsSchemaName();
		pfsMetadataTable.Type = 'data';

		const papiClient: PapiClient = Helper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey);
		return await papiClient.post('/addons/schemes', pfsMetadataTable);
	}

	private getPfsSchemaName(): string 
	{
		return `pfs_${this.request.query.addon_uuid}_${this.schema.Name}`;
	}

	private async subscribeToExpiredRecords(): Promise<Subscription>
	{
		const shouldHideSubscription = false;
		return this.expiredRecordsSubscription(shouldHideSubscription);
	}

	private async unsubscribeToExpiredRecords(): Promise<Subscription>
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

	/**
     * Upsert the PFS's fields to the requested schema.
     * @returns the addon data scheme after the PFS's fields addition.
     */
	private async upsertClientSchemaWithPfsFields(): Promise<AddonDataScheme> 
	{
		const pfsMetadataTable = {
			...pfsSchemaData,
			...this.schema
		};

		const papiClient: PapiClient = Helper.createPapiClient(this.client, this.request.query.addon_uuid, this.request.header["x-pepperi-secretkey"]);
		return await papiClient.post('/addons/schemes', pfsMetadataTable);
	}

	
	private validateSchema(): void 
	{
		this.validateSchemaType();
		this.validateSchemaName();
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
		await Helper.createPapiClient(this.client, config.AddonUUID, this.client.AddonSecretKey).post(`addons/data/schemes/${this.getPfsSchemaName}/purge`);

		// Unsubscribe from the PFS's 'remove' notifications
		return await this.unsubscribeToExpiredRecords()
	}
}