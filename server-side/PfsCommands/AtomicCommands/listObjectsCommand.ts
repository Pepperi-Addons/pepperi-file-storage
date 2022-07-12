import { AddonData } from '@pepperi-addons/papi-sdk';
import AbstractCommand from '../abstractCommand';

export class ListObjectsCommand extends AbstractCommand 
{

	public async execute(): Promise<AddonData[]>{
		return await this.listObjects();
	}

	private async listObjects(whereClause?:string)
	{
		//TODO order by creation date, to support DIMX export.
		return this.pfsGetter.getObjects(whereClause);
	}
}
