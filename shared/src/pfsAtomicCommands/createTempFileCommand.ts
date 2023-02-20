import jwtDecode from 'jwt-decode';

import { CdnServers, TempFile } from '../constants';
import { ICommand } from '../iCommand';
import PfsService from '../pfs.service';
import { Request } from '@pepperi-addons/debug-server/dist';
import { IPfsMutator } from '../iPfsMutator';
import { IPfsGetter } from '../iPfsGetter';
import TempFileService from '../tempFileService';

export class CreateTempFileCommand extends PfsService implements ICommand 
{
	protected environment: string;

	constructor(protected OAuthAccessToken: string, request: Request, pfsMutator: IPfsMutator, pfsGetter: IPfsGetter)
	{
		super(request, pfsMutator, pfsGetter);

		this.environment = jwtDecode(OAuthAccessToken)['pepperi.datacenter'];
	}
	public async execute(): Promise<TempFile>
	{
		return await this.createTempFile();
	}

	protected async createTempFile(): Promise<TempFile>
	{
		const tempFileService = new TempFileService(this.OAuthAccessToken);
		const tempFileKey = tempFileService.createTempFileFullPath(this.request.body.FileName);
		const putURL = await this.pfsMutator.createTempFile(tempFileKey, this.request.body.MIME);

		// Create a GET url for the temp file
		const downloadURL =  `${CdnServers[this.environment]}/${tempFileKey}`;

		// Create a TempFile object
		const res: TempFile = {
			PutURL: putURL,
			DownloadURL: downloadURL,
		};
		
		return res;
	}
}
