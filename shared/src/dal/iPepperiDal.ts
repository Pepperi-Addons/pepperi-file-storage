import { AddonData, FindOptions } from "@pepperi-addons/papi-sdk";

export interface IPepperiDal {
    getDataFromTable(tableName: string, findOptions: FindOptions): Promise<AddonData[]>;

    postDocumentToTable(tableName: string, document: any): Promise<AddonData>;
    
    hardDeleteDocumentFromTable(tableName: string, key: any): Promise<any>;
}
