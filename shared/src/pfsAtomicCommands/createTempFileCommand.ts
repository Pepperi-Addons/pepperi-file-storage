import { TempFile } from '../constants';
import { ICommand } from '../iCommand';
import PfsService from '../pfs.service';
import { v4 as createUUID } from 'uuid';

export class CreateTempFileCommand extends PfsService implements ICommand 
{

	public async execute(): Promise<TempFile>{
		return await this.createTempFile();
	}

	private async createTempFile(): Promise<TempFile>
	{
		const tempFileName = this.request.body.FileName ? this.request.body.FileName : createUUID();
		const res: TempFile = await this.pfsMutator.createTempFile(tempFileName, this.request.body.MIME);
		
		return res;
	}
}
