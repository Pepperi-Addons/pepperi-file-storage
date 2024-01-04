import { Request } from "@pepperi-addons/debug-server/dist";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { ICacheService } from "../i-cache.service";
import { CacheUpdateResult, IModifiedObjects } from "../update-cache/i-modified-objects";

export class CrawlingTargetService {

    protected sourceSchemaName: string;
    protected targetData: { SchemaNames: string[] };

    constructor(protected cacheService: ICacheService, protected request: Request)
    {
        console.log("Initializing CrawlingTargetService...");

        this.sourceSchemaName = this.request.body?.Page[0]?.ObjectSourceSchema;
        this.targetData = this.request.body?.TargetData;

        this.validateInput();
    }

    validateInput(): void
    {
        console.log("Validating input...");

        if (!this.targetData)
        {
            throw new Error("TargetData is missing");
        }

        if (!this.targetData.SchemaNames)
        {
            throw new Error("SchemaNames is missing");
        }

        if (!this.targetData.SchemaNames.includes(this.sourceSchemaName))
        {
            throw new Error(`SchemaNames does not include ${this.sourceSchemaName}`);
        }

        if (!this.sourceSchemaName)
        {
            throw new Error("ObjectSourceSchema is missing");
        }

        console.log("Input validation successful.");
    }

    /**
     * Update the cache with the modified objects.
     * @returns { Promise<any> } - The result of the cache update.
     */
    public async updateCache(): Promise<any>
    {
        console.log("Updating cache...");

        const pageToUpdate: IModifiedObjects = this.getModifiedObjects();
        console.log("Modified objects retrieved.");

        const cacheUpdateResults: CacheUpdateResult[] = await this.cacheService.updateCache(pageToUpdate);
        console.log("Cache updated.");

        const result = this.constructCrawlerOutputs(cacheUpdateResults);
        console.log("Crawler outputs constructed:", result);

        console.log("Cache update completed.");

        return result;
    }

    /**
     * Construct the modified objects to update the cache with.
     * @returns { IModifiedObjects } - The modified objects to update the cache with.
    */
    protected getModifiedObjects(): IModifiedObjects
    {
        console.log("Constructing modified objects...");

        let pageToUpdate = this.changeModificationDateTimeToObjectModificationDateTime();
        pageToUpdate = this.removeObjectSourceSchemaProperty(pageToUpdate);

        const result: IModifiedObjects = {
            AddonUUID: PfsAddonUUID,
            SourceAddonUUID: PfsAddonUUID,
            SchemeName: this.sourceSchemaName,
            Updates: pageToUpdate
        };

        console.log("Modified objects constructed.");

        return result;
    }

    /**
     * Change the ModificationDateTime property to ObjectModificationDateTime.
     * @returns { any[] } - The modified page.
     */
    protected changeModificationDateTimeToObjectModificationDateTime(): any[] {
        console.log("Changing ModificationDateTime to ObjectModificationDateTime...");

        return this.request.body.Page.map((entry: any) => {
            const objectCopy = Object.assign({}, entry);
            objectCopy.ObjectModificationDateTime = objectCopy.ModificationDateTime;
            delete objectCopy.ModificationDateTime;
            return objectCopy;
        });
    }

    /**
     * Remove the ObjectSourceSchema property from the page.
     * @param pageToUpdate - The page to update.
     * @returns { any[] } - The modified page.
     */
    protected removeObjectSourceSchemaProperty(pageToUpdate: any[]): any[] {
        console.log("Removing ObjectSourceSchema property...");

        return pageToUpdate.map((entry: any) => {
            const objectCopy = Object.assign({}, entry);
            delete objectCopy.ObjectSourceSchema;
            return objectCopy;
        });
    }

    /**
     * Construct the crawler outputs.
     * @param { CacheUpdateResult[] } cacheUpdateResults - The cache update results.
     * @returns { any } - The crawler outputs.
     */
    protected constructCrawlerOutputs(cacheUpdateResults: CacheUpdateResult[]): { Outputs: { [key: string]: number }} {
        console.log("Constructing crawler outputs...");

        const result: { Outputs: { [key: string]: number }} = { Outputs: {}};
        const fieldIds = ['TotalChanges', 'TotalChangesSuccess', 'TotalChangesFailed'];

        fieldIds.forEach((fieldId) => {
            result.Outputs[`${fieldId}_${this.sourceSchemaName}`] = 0;
        });

        cacheUpdateResults.forEach((cacheUpdateResult) => {
            result.Outputs[`TotalChanges_${this.sourceSchemaName}`]++;

            if (cacheUpdateResult.Status === 'Insert' || cacheUpdateResult.Status === 'Update')
            {
                result.Outputs[`TotalChangesSuccess_${this.sourceSchemaName}`]++;
            }
            else if (cacheUpdateResult.Status === 'Error')
            {
                result.Outputs[`TotalChangesFailed_${this.sourceSchemaName}`]++;
            }
        });

        console.log("Crawler outputs constructed:", result);

        return result;
    }
}
