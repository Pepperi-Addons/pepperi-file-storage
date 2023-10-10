import { AddonDataScheme, AddonFile, PapiClient, TemporaryFile } from "@pepperi-addons/papi-sdk";

import { AddonUUID } from "../../../addon.config.json";

export class PfsOnlineService 
{
	constructor(public papiClient: PapiClient)
	{}

	public async getSchema(schemaName: string): Promise<any>
	{
		console.log(`Online: Getting schema ${schemaName}...`);

		const res = await this.papiClient.addons.data.schemes.name(schemaName).get();

		console.log(`Online: Got schema ${schemaName}: ${JSON.stringify(res)}`);

		return res;
	}

	public async createSchema(schema: AddonDataScheme): Promise<any>
	{
		console.log(`Online: Creating schema ${schema.Name}...`);

		const res = await this.papiClient.addons.data.schemes.post(schema);

		console.log(`Online: Created schema ${schema.Name}: ${JSON.stringify(res)}`);

		return res;
	}

	public async purgeSchema(schemaName: string): Promise<any>
	{
		console.log(`Online: Purging schema ${schemaName}...`);

		const res = await this.papiClient.post(`/addons/data/schemes/${schemaName}/purge`);

		console.log(`Online: Purged schema ${schemaName}: ${JSON.stringify(res)}`);

		return res;
	}

	public async post(schemaName: string, data: AddonFile): Promise<AddonFile>
	{
		console.log(`Online: Posting to schema ${schemaName}...`);

		const res = await this.papiClient.addons.pfs.uuid(AddonUUID).schema(schemaName).post(data);

		console.log(`Online: Posted to schema ${schemaName}: ${JSON.stringify(res)}`);

		let onlineFile: AddonFile | undefined = undefined;
		let retries = 0;
		while (!this.areAddonFilesEqual(res, onlineFile) && retries < 10)
		{
			//wait one second 
			await new Promise(resolve => setTimeout(resolve, 1000));
			onlineFile = await this.getByKey(schemaName, res.Key!);
			retries++;
		}

		if(!this.areAddonFilesEqual(res, onlineFile))
		{
			throw new Error(`Online: Posted to schema ${schemaName} - could not verify: ${JSON.stringify(onlineFile)}. Expected : ${JSON.stringify(res)}`);
		}

		console.log(`Online: Posted to schema ${schemaName} - verified: ${JSON.stringify(onlineFile)}`);
		

		// await PNSs to finish propagating for 5 seconds
		await new Promise(resolve => setTimeout(resolve, 5000));

		return res;
	}

	public async getByKey(schemaName: string, key: string): Promise<AddonFile>
	{
		console.log(`Online: Getting by key ${key} from schema ${schemaName}...`);

		const res = await this.papiClient.addons.pfs.uuid(AddonUUID).schema(schemaName).key(key).get();

		console.log(`Online: Got by key ${key} from schema ${schemaName}: ${JSON.stringify(res)}`);

		return res;
	}

	public async createTempFile(): Promise<TemporaryFile>
	{
		console.log(`Online: Creating temp file...`);

		const res = await this.papiClient.addons.pfs.temporaryFile();

		console.log(`Online: Created temp file: ${JSON.stringify(res)}`);

		return res;
	}

	protected areAddonFilesEqual(file1: AddonFile, file2: AddonFile | undefined): boolean
	{
		
		
		// check every property listed on AddonFile interface
		let res: boolean = !!file2;

		const propertiesToDisregard: string[] = ["Thumbnails", "IntegrationTestData"];

		if(res)
		{
			for (const prop of Object.keys(file1 ?? {}))
			{
				if (!propertiesToDisregard.includes(prop) && file1[prop] !== file2![prop])
				{
					res = false;
					console.log(`Online: Posted to schema - not equal: ${prop} - ${file1[prop]} != ${file2![prop]}`);
					break;
				}
			}
		}

		if(res)
		{
			for (const prop of Object.keys(file2!))
			{
				if (!propertiesToDisregard.includes(prop) &&  file1[prop] !== file2![prop])
				{
					res = false;
					console.log(`Online: Posted to schema - not equal: ${prop} - ${file1[prop]} != ${file2![prop]}`);
					break;
				}
			}
		}
				
		return res;
	}
}
