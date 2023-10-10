import { BaseService, CPISideService, LocalCPISideService, ServicesContainer, SyncResult } from "@pepperi-addons/addon-testing-framework";
import { AddonDataScheme, AddonFile, FindOptions } from "@pepperi-addons/papi-sdk";
import { AddonsDataSearchParams} from "@pepperi-addons/cpi-node/build/cpi-side/client-api";

import { AddonUUID } from "../../../addon.config.json";
import { FileFindOptions } from "@pepperi-addons/papi-sdk/dist/endpoint";


export class PfsOfflineService extends BaseService
{
	protected clientApi : ReturnType<typeof CPISideService.prototype.pepperi.getClientApi>;
	constructor(servicesContainer: ServicesContainer)
	{
		super(servicesContainer);
		this.clientApi = this.cpiSideService.pepperi.getClientApi();
	}
	protected get cpiSideService(): CPISideService
	{
		return this.container.get(CPISideService, LocalCPISideService);
	}
	
	public async getSchema(schemaName: string): Promise<AddonDataScheme>
	{
		console.log(`Offline: Getting schema ${schemaName}...`);

		const searchParams: AddonsDataSearchParams = {
			Where: `Name='${schemaName}'`
		};

		const cpiCallingFunction = async () => await this.clientApi.addons.data.schemes.get(searchParams);

		const searchRes = await this.executeCpiEndpointWithRetries(cpiCallingFunction);

		if (searchRes.length > 0)
		{
			const res = searchRes[0];

			console.log(`Offline: Got schema ${schemaName}: ${JSON.stringify(res)}`);

			return res as AddonDataScheme;
		}
		else
		{
			throw new Error(`Offline: Schema ${schemaName} not found`);
		}
	}

	public async post(schemaName: string, data: AddonFile): Promise<AddonFile>
	{
		console.log(`Offline: Posting to schema ${schemaName}...`);

		const cpiCallingFunction = async () => await this.clientApi.addons.pfs.uuid(AddonUUID).schema(schemaName).post(data);

		const res = await this.executeCpiEndpointWithRetries(cpiCallingFunction);

		console.log(`Offline: Posted to schema ${schemaName}: ${JSON.stringify(res)}`);

		return res;
	}

	public async get(schemaName: string, findOptions: FindOptions | FileFindOptions, body?: any): Promise<AddonFile[]>
	{
		console.log(`Offline: Getting from schema ${schemaName}...`);

		let url = `/addon-cpi/files/find?addon_uuid=${AddonUUID}&resource_name=${schemaName}${body ? `&IntegrationTestData=${JSON.stringify(body.IntegrationTestData)}` : ""}`;
		const query = this.cpiSideService.pepperi.encodeQueryParams(findOptions);
		url = query ? url + "&" + query : url;

		// Since more data is passed as query param, we need to use the iApiCallHandler directly
		// instead of this.clientApi.addons.pfs.uuid(AddonUUID).schema(schemaName).find(findOptions);
		const cpiCallingFunction = async () => await this.cpiSideService.pepperi.iApiCallHandler.handleApiCall(AddonUUID, url,"GET", undefined, undefined);
		const res = await this.executeCpiEndpointWithRetries(cpiCallingFunction);

		console.log(`Offline: Got from schema ${schemaName}: ${JSON.stringify(res)}`);

		return res;
	}

	public async getByKey(schemaName: string, key: string, body?: any): Promise<AddonFile>
	{
		const integrationTestsDataParam = body ? `&IntegrationTestData=${JSON.stringify(body.IntegrationTestData)}` : "";
		const url = `/addon-cpi/file?addon_uuid=${AddonUUID}&resource_name=${schemaName}&key=${key}${integrationTestsDataParam}`;
		
		// Since more data is passed as query param, we need to use the iApiCallHandler directly
		// instead of this.clientApi.addons.pfs.uuid(AddonUUID).schema(schemaName).key(key).get();
		const cpiCallingFunction = async () => await this.cpiSideService.pepperi.iApiCallHandler.handleApiCall(AddonUUID, url,"GET", undefined, undefined);
		const res = await this.executeCpiEndpointWithRetries(cpiCallingFunction);

		console.log(`Offline: Got by key ${key} from schema ${schemaName}: ${JSON.stringify(res)}`);

		return res;
	}

	protected async executeCpiEndpointWithRetries(cpiCallingFunction: () => Promise<any>, retries = 3): Promise<any>
	{
		let res;
		for (let i = 0; i < retries; i++)
		{
			console.log(`Offline: Trying to call CPI for the ${ i + 1 } time...`);
			try
			{
				res = await cpiCallingFunction();
				break;
			}
			catch (err)
			{
				if(i < retries - 1)
				{
					console.log(`Offline: CPI call resulted in an exception: ${JSON.stringify(err)}`);
					console.log(`Offline: Trying to sync to resolve the issue...`);
					await this.sync();

					console.log(`Offline: Done Syncing. Trying to call CPI again.`);
				}
				else
				{
					throw err;
				}
			}
		}

		return res;
	}

	public async sync(): Promise<SyncResult>
	{

		let syncRes: SyncResult | undefined;
		const maxRetries = 3;

		for (let i = 0; i < maxRetries && !syncRes; i++)
		{
			try
			{
				console.log(`Offline: Syncing attempt number ${i + 1}...`);
				
				syncRes = await this.cpiSideService.sync();
				break;
			}
			catch (err)
			{
				if(i < maxRetries - 1)
				{
					console.log(`Offline: Sync resulted in an exception: ${JSON.stringify(err)}`);
					console.log(`Offline: Trying to sync to resolve the issue...`);
				}
				else
				{
					throw err;
				}
			}
		}

		console.log(`Offline: Synced: ${JSON.stringify(syncRes)}`);

		return syncRes!;
	}

	public async resync(): Promise<SyncResult>
	{
		let syncRes: SyncResult | undefined;
		const maxRetries = 3;

		for (let i = 0; i < maxRetries && !syncRes; i++)
		{
			try
			{
				console.log(`Offline: Resyncing attempt number ${i + 1}...`);
				
				syncRes = await this.cpiSideService.resync();
				break;
			}
			catch (err)
			{
				if(i < maxRetries - 1)
				{
					console.log(`Offline: Resync resulted in an exception: ${JSON.stringify(err)}`);
					console.log(`Offline: Trying to resync to resolve the issue...`);
				}
				else
				{
					throw err;
				}
			}
		}

		console.log(`Offline: Resynced: ${JSON.stringify(syncRes)}`);

		return syncRes!;
	}
}
