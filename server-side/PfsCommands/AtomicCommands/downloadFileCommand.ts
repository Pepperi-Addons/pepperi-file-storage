import ICommand from '../iCommand';
import PfsService from '../pfs.service';

export class downloadFileCommand extends PfsService implements ICommand 
{

	public async execute(): Promise<any>{
		return await this.downloadFile();
	}
}
