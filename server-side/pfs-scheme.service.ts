import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { AddonDataScheme, PapiClient } from "@pepperi-addons/papi-sdk";
import { METADATA_ADAL_TABLE_NAME, pfsSchemeData } from "./constants";

export class PfsSchemeService
{
	private papiClient: PapiClient;

	constructor(private client: Client, private request: Request)
	{
		this.papiClient = new PapiClient({
			token: client.OAuthAccessToken,
			baseURL: client.BaseURL,
			addonUUID: client.AddonUUID,
			addonSecretKey: client.AddonSecretKey,
			actionUUID: client.ActionUUID,
		});
	}

	public async create(): Promise<AddonDataScheme> 
	{
		this.validateSchemaType(this.request.body as AddonDataScheme);
		return this.upsertSchemeWithPfsFields();
	}

	private async upsertSchemeWithPfsFields(): Promise<AddonDataScheme> 
	{
		const pfsMetadataTable = {
			...pfsSchemeData,
			Name: METADATA_ADAL_TABLE_NAME
		};
		return this.papiClient.addons.data.schemes.post(pfsMetadataTable);
	}

	private validateSchemaType(schema: AddonDataScheme): void 
	{
		if (!schema || schema.Type !== 'pfs') 
		{
			throw new Error("The schema must be of type 'pfs'")
		}
	}


}