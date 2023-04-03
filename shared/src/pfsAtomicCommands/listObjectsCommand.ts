import { AddonData } from '@pepperi-addons/papi-sdk';
import { ICommand } from '../iCommand';
import PfsService from '../pfs.service';

export class ListObjectsCommand extends PfsService implements ICommand 
{

	public async execute(): Promise<AddonData[]>
	{
		return await this.listObjects();
	}

	private async listObjects()
	{
		return this.pfsGetter.getObjects();
	}
}
