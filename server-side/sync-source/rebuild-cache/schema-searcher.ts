import { AddonDataScheme, FindOptions, PapiClient } from "@pepperi-addons/papi-sdk";

import { ISchemaSearcher } from "./i-schema-searcher";


export class SchemaSearcher implements ISchemaSearcher
{
	constructor(protected papiClient: PapiClient)
	{}

	public async searchSchemas(findOptions: FindOptions): Promise<AddonDataScheme[]>
	{
		return await this.papiClient.addons.data.schemes.get(findOptions);
	}
}
