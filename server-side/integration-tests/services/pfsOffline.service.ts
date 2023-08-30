import { BaseService, CPISideService, LocalCPISideService, ServicesContainer, SyncResult } from '@pepperi-addons/addon-testing-framework';
import { AddonDataScheme, AddonFile, FindOptions } from '@pepperi-addons/papi-sdk';
import { AddonsDataSearchParams} from '@pepperi-addons/cpi-node/build/cpi-side/client-api'

import { AddonUUID } from '../../../addon.config.json';
import { FileFindOptions } from '@pepperi-addons/papi-sdk/dist/endpoint';


export class PfsOfflineService extends BaseService
{
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

        const searchRes = await this.container.get(CPISideService).pepperi.clientApi.addons.data.schemes.get(searchParams);
        if (searchRes.length > 0)
        {
            const res = searchRes[0];

            console.log(`Offline: Got schema ${schemaName}: ${JSON.stringify(res)}`);

            return res as AddonDataScheme;
        }
        else
        {
            throw new Error(`Schema ${schemaName} not found`);
        }
    }

    public async post(schemaName: string, data: AddonFile): Promise<AddonFile>
	{
		console.log(`Posting to schema ${schemaName}...`);

        const res = await this.cpiSideService.pepperi.clientApi.addons.pfs.uuid(AddonUUID).schema(schemaName).post(data);

        console.log(`Posted to schema ${schemaName}: ${JSON.stringify(res)}`);

        return res;
	}

    public async get(schemaName: string, findOptions: FindOptions | FileFindOptions): Promise<AddonFile[]>
    {
        console.log(`Offline: Getting from schema ${schemaName}...`);

        const res = await this.cpiSideService.pepperi.clientApi.addons.pfs.uuid(AddonUUID).schema(schemaName).find(findOptions);

        console.log(`Offline: Got from schema ${schemaName}: ${JSON.stringify(res)}`);

        return res;
    }

    public async getByKey(schemaName: string, key: string): Promise<AddonFile>
    {
        console.log(`Offline: Getting by key ${key} from schema ${schemaName}...`);

        const res = await this.cpiSideService.pepperi.clientApi.addons.pfs.uuid(AddonUUID).schema(schemaName).key(key).get();

        console.log(`Offline: Got by key ${key} from schema ${schemaName}: ${JSON.stringify(res)}`);

        return res;
    }

    public async sync(): Promise<SyncResult>
    {
        console.log(`Offline: Syncing...`);

        const syncRes = await this.cpiSideService.sync();

        console.log(`Offline: Synced: ${JSON.stringify(syncRes)}`);

        return syncRes;
    }

}
