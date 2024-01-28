import {mapLimit as asyncMapLimit} from "async";
import { AddonData, CrawlerTargetInput } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { CrawlOutputsPrefixes, CrawlOutputsPrefixesEnum } from "./constants";
import { CacheUpdateResult, ICacheService, IModifiedObjects } from "../entities";
import { UpdatedObjectsBuilder } from "./updated-object.builder";


export class CrawlingTargetService 
{
	protected schemaNameToModifiedObjects: Map<string, IModifiedObjects> = new Map<string, IModifiedObjects>();

	/**
	 * The maximum number of concurrent update requests to the cache.
	 */
	protected readonly MAX_CONCURRENT_REQUESTS = 5;
	protected pageToUpdate: AddonData[];

	constructor(protected cacheService: ICacheService, targetInput: CrawlerTargetInput)
	{
		this.pageToUpdate = targetInput.Page as AddonData[];
	}

	/**
     * Update the cache with the modified objects.
     * @returns { Promise<any> } - The result of the cache update.
     */
	public async updateCache(): Promise<any>
	{
		console.log("Updating cache...");

		this.populateModifiedObjectsSet();
		console.log("Modified objects retrieved.");

		// update the cache for each schema in parallel
		const cacheUpdateResults = await asyncMapLimit(this.schemaNameToModifiedObjects.keys(), this.MAX_CONCURRENT_REQUESTS, async (schemaName) => this.updateSchemaCache(schemaName));
		
		// consolidate cacheUpdateResults into a single object, (e.g. { Outputs: { TotalChanges: 10, TotalChangesSuccess: 10, TotalChangesFailed: 0 } })
		const consolidatedCacheUpdateResults = this.consolidateTargetOutputResults(cacheUpdateResults);

		console.log("Cache update completed.");

		return consolidatedCacheUpdateResults;
	}

	private async updateSchemaCache(schemaName: string) 
	{
		let crawlerOutput: { Outputs: { [key: string]: number; }; } = { Outputs: {} };

		const modifiedObjects = this.schemaNameToModifiedObjects.get(schemaName);
		if (modifiedObjects)
		{
			const cacheUpdateResults: CacheUpdateResult[] = await this.cacheService.updateCache(modifiedObjects);
			console.log(`Cache updated for schema ${schemaName}.`);

			crawlerOutput = this.constructCrawlerOutputs(cacheUpdateResults, schemaName);
		}
		else // should never happen
		{
			console.error(`Modified objects for schema ${schemaName} not found`);
			crawlerOutput = { Outputs: {} };
		}

		return crawlerOutput;
	}

	/**
	 * Consolidate the target output results.
	 * @param { {Outputs: { [key:string] : number}}[] } cacheUpdateResults - The cache update results.
	 * @returns 
	 */
	protected consolidateTargetOutputResults(cacheUpdateResults: {Outputs: { [key: string]: number }}[]): {Outputs: { [key: string]: number}}
	{
		return cacheUpdateResults.reduce((acc, curr) => 
		{
			Object.keys(curr.Outputs).forEach((key) => 
			{
				acc.Outputs[key] = (acc.Outputs[key] || 0) + curr.Outputs[key];
			});

			return acc;
		}, { Outputs: {} });
	}


	/**
    * Populate the modified objects set with the modified objects from the request.
    * @returns { void }
    */
	protected populateModifiedObjectsSet(): void
	{
		console.log("Constructing modified objects...");
		const updatedObjectBuilder = new UpdatedObjectsBuilder();

		// Using a Map to efficiently store unique ObjectSourceSchema names and corresponding IModifiedObjects
		this.schemaNameToModifiedObjects = this.pageToUpdate.reduce((map, entry) => 
		{
			const sourceSchemaName = entry.ObjectSourceSchema as string;

			// Check if the Map already has an entry for the current sourceSchemaName
			if (!map.has(sourceSchemaName))
			{
				// If not, initialize an entry with default IModifiedObjects
				map.set(sourceSchemaName, {
					AddonUUID: PfsAddonUUID,
					SourceAddonUUID: PfsAddonUUID,
					SchemeName: sourceSchemaName,
					Updates: [],
				});
			}

			// Retrieve the existing IModifiedObjects for the current sourceSchemaName
			const schemaModifiedObjects = map.get(sourceSchemaName);

			// Add the modified object to the Updates array for the current sourceSchemaName
			schemaModifiedObjects?.Updates.push(updatedObjectBuilder.build(entry));

			// Return the updated Map for the next iteration
			return map;
		}, new Map<string, IModifiedObjects>());

		console.log("Modified objects constructed.");
	}

	/**
     * Construct the crawler outputs.
     * @param { CacheUpdateResult[] } cacheUpdateResults - The cache update results.
     * @returns { any } - The crawler outputs.
     */
	protected constructCrawlerOutputs(cacheUpdateResults: CacheUpdateResult[], schemaName: string): { Outputs: { [key: string]: number }} 
	{
		console.log("Constructing crawler outputs...");

		const result: { Outputs: { [key: string]: number }} = { Outputs: {}};

		CrawlOutputsPrefixes.forEach((fieldId) => 
		{
			result.Outputs[`${fieldId}_${schemaName}`] = 0;
		});

		cacheUpdateResults.forEach((cacheUpdateResult) => 
		{
			result.Outputs[`${CrawlOutputsPrefixesEnum.TotalChanges}_${schemaName}`]++;

			switch(cacheUpdateResult.Status)
			{
			case "Insert":
			case "Update":
				result.Outputs[`${CrawlOutputsPrefixesEnum.TotalChangesSuccess}_${schemaName}`]++;

				break;

			case "Ignore":
				result.Outputs[`${CrawlOutputsPrefixesEnum.TotalIgnores}_${schemaName}`]++;
				console.log(`Cache update ignored for internalID: ${cacheUpdateResult.InternalID}`);
				console.log(`Cache update result: ${JSON.stringify(cacheUpdateResult)}`);

				break;

			case "Error":
				result.Outputs[`${CrawlOutputsPrefixesEnum.TotalChangesFailed}_${schemaName}`]++;
				console.error(`Cache update failed for InternalID ${cacheUpdateResult.InternalID} with error: ${cacheUpdateResult.Message}`);

				break;

			default:
				console.error(`Unknown status: ${cacheUpdateResult.Status}`);
				console.error(`Cache update result: ${JSON.stringify(cacheUpdateResult)}`);
			}
		});

		console.log("Crawler outputs constructed:", result);

		return result;
	}
}
