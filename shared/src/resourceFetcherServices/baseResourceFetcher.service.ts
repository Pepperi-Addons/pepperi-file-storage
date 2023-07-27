import { AddonData, SearchData } from "@pepperi-addons/papi-sdk";
import { IFetchCommand } from "../iFetchCommand";

export class BaseResourceFetcherService
{
	constructor(protected pfsCommand: IFetchCommand)
	{}

	public async fetch(): Promise<any>
	{
		const response = await this.getResources();
		return this.formatResponse(response);
	}

	protected formatResponse(response: SearchData<AddonData>): any
	{
		return response.Objects;
	}

	protected async getResources(): Promise<SearchData<AddonData>>
	{
		return await this.pfsCommand.execute();
	}
}
