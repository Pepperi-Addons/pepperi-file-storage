import { AddonData, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";

export interface DataSearcher {
    searchDataInTable(tableName: string, searchBody: SearchBody): Promise<SearchData<AddonData>>
}