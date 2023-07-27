import { AddonData, SearchData } from '@pepperi-addons/papi-sdk';
import { BaseResourceFetcherService } from './baseResourceFetcher.service';


export class ResourceFetcherExportService extends BaseResourceFetcherService
{
	protected override formatResponse(response: SearchData<AddonData>): SearchData<AddonData>
	{
		return response;
	}
}
