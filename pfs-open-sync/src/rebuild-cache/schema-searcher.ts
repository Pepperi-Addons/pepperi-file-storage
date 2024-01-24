import { AddonDataScheme, FindOptions, PapiClient } from "@pepperi-addons/papi-sdk";

import { ISchemaSearcher } from "./i-schema-searcher";


export class SchemaSearcher implements ISchemaSearcher
{
	constructor(protected papiClient: PapiClient)
	{}

	public async searchSchemas(fields: string[]): Promise<AddonDataScheme[]>
	{
		const schemas: AddonDataScheme[] = [];

		let resourcesPage: AddonDataScheme[];
		let page = 1;

		do
		{
			const findOptions: FindOptions = {
				fields: fields,
				page_size: 1000,
				page: page,
			};

			resourcesPage = await this.papiClient.addons.data.schemes.get(findOptions);
			schemas.push(...resourcesPage);

			page++;
		}
		while(resourcesPage.length > 0);

		return schemas;
	}
}
