import AbstractCommand from '../abstractCommand';

export class downloadFileCommand extends AbstractCommand 
{

	public async execute(): Promise<any>{
		return await this.downloadFile();
	}
}
