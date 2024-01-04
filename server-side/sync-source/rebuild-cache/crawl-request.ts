import { Request } from "@pepperi-addons/debug-server/dist";
import { AddonDataScheme, FindOptions } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { ICrawlRequest, TargetOutput } from "./i-crawl-request";
import { ISchemaSearcher } from "./i-schema-searcher";


export class CrawlRequest implements ICrawlRequest
{
    Name: string;
    Description?: string | undefined;
    LockID?: string | undefined;
    SourceRelativeURL: string;
    TargetRelativeURL: string;
    SourceData?: any;
    TargetData?: any;
    MaxPageSize?: number | undefined;
    MaxConcurrency?: number | undefined;
    TargetOutputs: TargetOutput[] = [];

    protected constructor(request: Request)
    {
        console.log("Initializing CrawlRequest...");

        this.Name = this.getCrawlName(request);
        this.SourceRelativeURL = `/addons/api/${PfsAddonUUID}/sync_source/internal_crawler_source`;
        this.TargetRelativeURL = `/addons/api/${PfsAddonUUID}/sync_source/internal_crawler_target`;
    }

    public static async getInstance(request: Request, schemaSearcher: ISchemaSearcher): Promise<CrawlRequest>
    {
        console.log("Creating instance of CrawlRequest...");

        const crawlRequest = new CrawlRequest(request);
        await crawlRequest.initData(request, schemaSearcher);

        console.log("CrawlRequest instance created.");

        return crawlRequest;
    }

    protected getCrawlName(request: Request): string
    {
        console.log("Getting crawl name...");

        let name = 'Rebuild PFS SyncCache: ';
        if (request.body?.IncludedResources?.length > 0)
        {
            name += request.body.IncludedResources.join(', ');
        }
        else if (request.body?.ExcludedResources?.length > 0)
        {
            name += `All resources except ${request.body.ExcludedResources.join(', ')}`;
        }
        else
        {
            name += 'All resources';
        }

        console.log("Crawl name:", name);

        return name;
    }

    public async initData(request: Request, schemaSearcher: ISchemaSearcher): Promise<void>
    {
        console.log("Initializing data for CrawlRequest...");

        const schemaNamesToCrawl = await this.getSchemaNamesToCrawl(request, schemaSearcher);

        // Use SourceData to pass the schema names to crawl to the source.
        this.SourceData = {
            SchemaNames: schemaNamesToCrawl,
        };

        this.setTargetOutputs(schemaNamesToCrawl);

        console.log("Data initialized for CrawlRequest.");
    }

    private setTargetOutputs(schemaNamesToCrawl: string[])
    {
        console.log("Setting target outputs...");

        const fieldIds = ['TotalChanges', 'TotalChangesSuccess', 'TotalChangesFailed'];

        this.TargetOutputs = this.TargetOutputs.concat(
            schemaNamesToCrawl.flatMap(schemaName =>
                fieldIds.map(fieldId => ({
                    FieldID: `${fieldId}_${schemaName}`,
                    Type: 'Sum',
                }))
            )
        );

        console.log("Target outputs set:", this.TargetOutputs);
    }

    protected async getSchemaNamesToCrawl(request: Request, schemaSearcher: ISchemaSearcher): Promise<string[]>
    {
        console.log("Getting schema names to crawl...");

        const allSyncableResourceName = await this.getAllSyncableResourceNames(schemaSearcher);
        let resourceNamesToCrawl: string[] = request.body?.IncludedResources || [];

        // If no resources were specified, crawl all resources.
        if (resourceNamesToCrawl.length === 0)
        {
            resourceNamesToCrawl = [...allSyncableResourceName];
        }
        else
        {
            const unsyncableResourceNames = [...resourceNamesToCrawl].filter(
                schemaName => !allSyncableResourceName.has(schemaName)
            );
            if(unsyncableResourceNames.length > 0)
            {
                throw new Error(`The following resources are not syncable: ${unsyncableResourceNames.join(', ')}`);
            }
        }

        // Remove excluded resources.
        const excludedSchemaNames = new Set<string>(request.body?.ExcludedResources || []);
        const result: string[] = [...resourceNamesToCrawl].filter(schemaName => !excludedSchemaNames.has(schemaName));

        console.log("Schema names to crawl:", result);

        return result;
    }

    protected async getAllSyncableResourceNames(schemaSearcher: ISchemaSearcher): Promise<Set<string>>
    {
        console.log("Getting all syncable resource names...");

        const findOptions: FindOptions = {
            fields: ['Name', 'SyncData'],
            page_size: 1000,
            page: 1,
        };

        const resourceNames: Set<string> = new Set<string>();
        let resourcesPage: AddonDataScheme[] = [];

        do
        {
            resourcesPage = await schemaSearcher.searchSchemas(findOptions);

            // Add the syncable schema names to the set.
            // TODO: The filter here should be changed to resource.SyncData.GetServerChanges ont the new flag is added to the schemas.
            const resourceNamesPage = resourcesPage
                .filter(resource => resource.SyncData?.Sync)
                .map(resource => resource.Name);
            resourceNamesPage.map(resourceName => resourceNames.add(resourceName));

            (findOptions.page!)++;
        }
        while(resourcesPage.length > 0);

        console.log("All syncable resource names:", resourceNames);

        return resourceNames;
    }
}
