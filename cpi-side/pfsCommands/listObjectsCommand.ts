import { AddonsDataSearchResult } from '@pepperi-addons/cpi-node/build/cpi-side/client-api';
import { AddonData } from '@pepperi-addons/papi-sdk';
import AbstractCommand from './abstractCommand';

export class ListObjectsCommand extends AbstractCommand 
{

	public async execute(): Promise<AddonsDataSearchResult>{
		return await this.listObjects();
	}

	private async listObjects(whereClause?:string)
	{
		return this.pfsGetter.getObjects(whereClause);
	}
}
