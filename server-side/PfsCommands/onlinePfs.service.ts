import { Request } from '@pepperi-addons/debug-server';
import { AddonData } from '@pepperi-addons/papi-sdk';
import { IPfsGetter, IPfsMutator } from 'pfs-shared';
import { ServerHelper } from '../serverHelper';
import {PfsService as SharedPfsService} from './pfs.service'


export abstract class PfsService extends SharedPfsService
{
	constructor(OAuthAccessToken: string, protected request: Request, protected pfsMutator: IPfsMutator, protected pfsGetter: IPfsGetter ) 
	{
		super(OAuthAccessToken, request, pfsMutator, pfsGetter);
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
