import { AddonDataScheme, FindOptions, CrawlerInput, CrawlerTargetOutputBlueprint } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { ISchemaSearcher } from "./i-schema-searcher";
import { CrawlOutputsPrefixes } from "../handle-crawling/constants";
import { CacheRebuildRequest } from "../entities";


export class CrawlRequest
{
	constructor(protected cacheRebuildRequest: CacheRebuildRequest, protected schemaSearcher: ISchemaSearcher)
	{ }

	public async build(): Promise<CrawlerInput>
	{
		const schemaNamesToCrawl = await this.getSchemaNamesToCrawl();

		return {
			Name: this.getCrawlName(),
			SourceRelativeURL: `/addons/api/${PfsAddonUUID}/sync_source/internal_crawler_source`,
			TargetRelativeURL: `/addons/api/${PfsAddonUUID}/sync_source/internal_crawler_target`,
			SourceData: {
				SchemaNames: schemaNamesToCrawl,
			},
			MaxPageSize: 250,// This is ADAL's limit, NUC could handle more, but why risk it?
			TargetOutputs: this.getTargetOutputs(schemaNamesToCrawl),
		};
	}

	protected getCrawlName(): string
	{
		let name = "Rebuild PFS SyncCache: ";
		if(Array.isArray(this.cacheRebuildRequest.IncludedResources) && this.cacheRebuildRequest.IncludedResources.length > 0)
		{
			name += this.cacheRebuildRequest.IncludedResources.join(", ");
		}
		else if (Array.isArray(this.cacheRebuildRequest.ExcludedResources) && this.cacheRebuildRequest.ExcludedResources.length > 0)
		{
			name += `All resources except ${this.cacheRebuildRequest.ExcludedResources.join(", ")}`;
		}
		else
		{
			name += "All resources";
		}

		console.log("Crawl name:", name);

		return name;
	}

	protected getTargetOutputs(schemaNamesToCrawl: string[]): CrawlerTargetOutputBlueprint[]
	{
		return schemaNamesToCrawl.flatMap(schemaName =>
			CrawlOutputsPrefixes.map(fieldId => ({
				FieldID: `${fieldId}_${schemaName}`,
				Type: "Sum",
			}))
		);
	}

	protected async getSchemaNamesToCrawl(): Promise<string[]>
	{
		console.log("Getting schema names to crawl...");

		const allSyncableResourceName = await this.getAllSyncableResourceNames();
		let resourceNamesToCrawl: string[] = this.cacheRebuildRequest.IncludedResources || [];

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
				throw new Error(`The following resources are not syncable: ${unsyncableResourceNames.join(", ")}`);
			}
		}

		// Remove excluded resources.
		const excludedSchemaNames = new Set<string>(this.cacheRebuildRequest.ExcludedResources || []);
		const result: string[] = [...resourceNamesToCrawl].filter(schemaName => !excludedSchemaNames.has(schemaName));

		console.log("Schema names to crawl:", result);

		return result;
	}

	protected async getAllSyncableResourceNames(): Promise<Set<string>>
	{
		console.log("Getting all syncable resource names...");

		const requiredFields = ["Name", "SyncData"];
		const schemasWithSyncData: AddonDataScheme[] = await this.schemaSearcher.searchSchemas(requiredFields);

		// Filter out schemas that are not syncable.
		const syncableSchemas = schemasWithSyncData.filter(schema => schema.SyncData?.Sync && schema.SyncData?.SyncRecords);

		// Add the syncable schema names to the set.
		const resourceNames = new Set<string>(syncableSchemas.map(schema => schema.Name));

		console.log("All syncable resource names:", resourceNames);

		return resourceNames;
	}
}
