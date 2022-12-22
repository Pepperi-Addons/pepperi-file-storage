import ICommand from '../iCommand';
import PfsService from '../onlinePfs.service';

export class downloadFileCommand extends PfsService implements ICommand 
{

	public async execute(): Promise<any>{
		return await this.downloadFile();
	}
}
