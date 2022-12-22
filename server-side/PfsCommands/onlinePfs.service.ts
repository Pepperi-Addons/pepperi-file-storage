import { Client, Request } from '@pepperi-addons/debug-server';
import { AddonData } from '@pepperi-addons/papi-sdk';
import { IPfsGetter, IPfsMutator, PfsService as SharedPfsService  } from 'pfs-shared';
import { ServerHelper } from '../serverHelper';
// import {PfsService as SharedPfsService} from './pfs.service'


export abstract class PfsService extends SharedPfsService
{
	constructor(protected client: Client, protected request: Request, protected pfsMutator: IPfsMutator, protected pfsGetter: IPfsGetter ) 
	{
		super(client.OAuthAccessToken, request, pfsMutator, pfsGetter);
		request.header = ServerHelper.getLowerCaseHeaders(request.header);
	}

	protected doesDownloadResultContainASingleObject(res: AddonData[]): boolean
	{
		return res.length === 1;
	}

	protected returnASingleObjectFromDownloadResult(res: AddonData[]): AddonData {
		return res[0];
	}
}

export default PfsService;
