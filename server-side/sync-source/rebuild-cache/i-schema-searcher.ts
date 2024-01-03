import { AddonDataScheme, FindOptions } from "@pepperi-addons/papi-sdk";

export interface ISchemaSearcher
{
    searchSchemas(findOptions: FindOptions): Promise<AddonDataScheme[]>
}