import { AddonData, PapiClient, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { DataSearcher } from "../entities/data-searcher";

export class DefaultDataSearcher implements DataSearcher
{
    constructor(protected papiClient: PapiClient)
    {}

    public async searchDataInTable(tableName: string, searchBody: SearchBody): Promise<SearchData<AddonData>>
    {
        return await this.papiClient.addons.data.search.uuid(PfsAddonUUID).table(tableName).post(searchBody);
    }
}
