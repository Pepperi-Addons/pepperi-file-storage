import AbstractCommand from './abstractCommand';

export class DownloadFileCommand extends AbstractCommand 
{

	public async execute(): Promise<any>{
		return await this.downloadFile();
	}
}
