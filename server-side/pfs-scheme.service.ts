import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonDataScheme, PapiClient } from "@pepperi-addons/papi-sdk";
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
     * Completes the schema creation process by adding the PFS's fields to the schema.
     * @returns the addon data scheme after the PFS's fields addition.
     */
	public async create(): Promise<AddonDataScheme> 
	{
		await this.validateSchemaCreationRequest();

		// Upsert the schema as requested by the client, adding PFS's default fields and indices.
		const schemaCreationRes = this.upsertSchemaWithPfsFields();

		// Subscribe to Remove events on the schema
		await this.subscribeToExpiredRecords();

		return schemaCreationRes;
	}

	private async subscribeToExpiredRecords() 
	{
		const papiClient = Helper.createPapiClient(this.client, config.AddonUUID);
		await papiClient.notification.subscriptions.upsert({
			AddonUUID:config.AddonUUID,
			Name: "pfs-expired-adal-records-subscription",
			Type:"data",
			FilterPolicy: {
				Resource: [this.schema.Name],
				Action:["remove"],
				AddonUUID:[this.request.query.addon_uuid]
			},
			AddonRelativeURL:'/api/record_removed' // the path of the function that will remove the file from S3
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
	private async upsertSchemaWithPfsFields(): Promise<AddonDataScheme> 
	{
		const pfsMetadataTable = {
			...pfsSchemaData,
			...this.schema
		};

		const papiClient = Helper.createPapiClient(this.client, this.request.query.addon_uuid, this.request.header["x-pepperi-secretkey"]);
		return papiClient.addons.data.schemes.post(pfsMetadataTable);
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
			//Uncomment when we actually have a pfs type
			// throw new Error("The schema must be of type 'pfs'")
		}
	}

	private validateSchemaName() 
	{
		if (!this.schema || !this.schema.Name) 
		{
			throw new Error("The schema must have a Name property");
		}
	}
}