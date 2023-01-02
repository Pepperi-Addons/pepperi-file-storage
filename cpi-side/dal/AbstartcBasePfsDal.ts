import { Request } from '@pepperi-addons/debug-server';
import { IPfsGetter } from 'pfs-shared';
import { AddonData } from '@pepperi-addons/papi-sdk';


export abstract class AbstractBasePfsDal implements IPfsGetter
{
	protected clientAddonUUID: string;
	protected clientSchemaName: string;
    
	constructor(protected request: Request)
	{
		this.clientAddonUUID = this.request.query.addon_uuid;
		this.clientSchemaName = this.request.query.resource_name;
	}

	//#region IPfsGetter

	abstract isObjectLocked(key: string);

	abstract getObjectS3FileVersion(Key: any);

	abstract getObjects(whereClause?: string): Promise<AddonData[]>;
	//#endregion
}
