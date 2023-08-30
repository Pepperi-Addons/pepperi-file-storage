import { AddonDataScheme, AddonFile, PapiClient } from '@pepperi-addons/papi-sdk';

import { AddonUUID } from '../../../addon.config.json';

export class PfsOnlineService 
{
	constructor(public papiClient: PapiClient)
	{}

	public async getSchema(schemaName: string): Promise<any>
	{
		console.log(`Getting schema ${schemaName}...`);

		const res = await this.papiClient.addons.data.schemes.name(schemaName).get();

		console.log(`Got schema ${schemaName}: ${JSON.stringify(res)}`);

		return res
	}

	public async createPfsSchema(schema: AddonDataScheme): Promise<any>
	{
		console.log(`Creating schema ${schema.Name}...`);

		const res = await this.papiClient.addons.data.schemes.post(schema);

		console.log(`Created schema ${schema.Name}: ${JSON.stringify(res)}`);

		return res;
	}

	public async purgePfsSchema(schemaName: string): Promise<any>
	{
		console.log(`Purging schema ${schemaName}...`);

		const res = await this.papiClient.post(`/addons/data/schemes/${schemaName}/purge`);

		console.log(`Purged schema ${schemaName}: ${JSON.stringify(res)}`);

		return res;
	}

	public async post(schemaName: string, data: AddonFile): Promise<AddonFile>
	{
		console.log(`Posting to schema ${schemaName}...`);

		const res = await this.papiClient.addons.pfs.uuid(AddonUUID).schema(schemaName).post(data);

		console.log(`Posted to schema ${schemaName}: ${JSON.stringify(res)}`);
		
		return res;
	}

	public async getByKey(schemaName: string, key: string): Promise<AddonFile>
	{
		console.log(`Getting by key ${key} from schema ${schemaName}...`);

		const res = await this.papiClient.addons.pfs.uuid(AddonUUID).schema(schemaName).key(key).get();

		console.log(`Got by key ${key} from schema ${schemaName}: ${JSON.stringify(res)}`);

		return res;
	}
}
