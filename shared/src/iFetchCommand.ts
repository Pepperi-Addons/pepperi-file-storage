import { AddonData, SearchData } from "@pepperi-addons/papi-sdk";

import { ICommand } from "./iCommand";


export interface IFetchCommand extends ICommand 
{
	execute(): Promise<SearchData<AddonData>>;
}
