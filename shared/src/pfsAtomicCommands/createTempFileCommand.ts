import { TempFile } from '../constants';
import { ICommand } from '../iCommand';
import PfsService from '../pfs.service';

export class CreateTempFileCommand extends PfsService implements ICommand 
{

	public async execute(): Promise<any>{
		return await this.downloadFile();
	}

	private async createTempFile(): Promise<TempFile>
	{
		// /{{distUUID}}/temp/{{randomUUID}}/`FileName ? FileName : createUUID()
		const tempFileRequest = `/${this}/temp/${this.createUUID()}/${this.request.query.FileName ? this.request.query.FileName : this.createUUID()}`;
	}
}
