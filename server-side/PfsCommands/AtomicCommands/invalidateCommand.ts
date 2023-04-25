
import { ICommand } from 'pfs-shared';
import PfsService from '../onlinePfs.service';


export class InvalidateCommand extends PfsService implements ICommand 
{
	public async execute(): Promise<any>{
		return await this.invalidate();
	}

	private async invalidate() 
	{
		if (!this.request.query.key) 
		{
			throw new Error("Missing mandatory parameter 'Key'");
		}

		// Support invalidating deleted files as well
		// For more info, see https://pepperi.atlassian.net/browse/DI-20796
		this.request.query.include_deleted = true;
		const file = await this.downloadFile(this.request.query.key);
		const fileCopy = {...file, doesFileExist: true};
  		await this.pfsMutator.invalidateCDN(fileCopy);

		return file;
	}
}
