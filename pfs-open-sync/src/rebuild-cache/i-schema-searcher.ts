import { AddonDataScheme } from "@pepperi-addons/papi-sdk";

export interface ISchemaSearcher
{
    /**
     * Retrieve all addon's schemas (no external pagination is needed)
     * @param { string[] } fields - The schema fields that will be returned
     */
    searchSchemas(fields: string[]): Promise<AddonDataScheme[]>
}
