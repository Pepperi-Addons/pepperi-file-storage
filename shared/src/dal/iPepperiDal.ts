import { AddonData, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";

export interface IPepperiDal
{
    searchDataInTable(tableName: string, searchBody: SearchBody): Promise<SearchData<AddonData>>;

    postDocumentToTable(tableName: string, document: any): Promise<AddonData>;
    
    hardDeleteDocumentFromTable(tableName: string, key: any): Promise<any>;
}
