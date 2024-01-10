import { Request } from "@pepperi-addons/debug-server/dist";
import {mapLimit as asyncMapLimit} from "async";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { ICacheService } from "../i-cache.service";
import { CacheUpdateResult, IModifiedObjects } from "../update-cache/i-modified-objects";
import { CrawlOutputsPrefixes, CrawlOutputsPrefixesEnum } from "./constants";


export class CrawlingTargetService 
{
	protected schemaNameToModifiedObjects: Map<string, IModifiedObjects> = new Map<string, IModifiedObjects>();

	/**
	 * The maximum number of concurrent update requests to the cache.
	 */
	protected readonly MAX_CONCURRENT_REQUESTS = 5;

	constructor(protected cacheService: ICacheService, protected request: Request)
	{}

	/**
     * Update the cache with the modified objects.
     * @returns { Promise<any> } - The result of the cache update.
     */
	public async updateCache(): Promise<any>
	{
		console.log("Updating cache...");

		this.populateModifiedObjectsSet();
		console.log("Modified objects retrieved.");

		// This function is defined as an arrow function so that it
		// can be passed to asyncMapLimit and keep "this" context
		const updateCacheForSchema = async (schemaName: string) => 
		{
			let crawlerOutput: { Outputs: { [key: string]: number }} = { Outputs: {}};
	
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
		};
		
		// update the cache for each schema in parallel
		const cacheUpdateResults = await asyncMapLimit(this.schemaNameToModifiedObjects.keys(), this.MAX_CONCURRENT_REQUESTS, updateCacheForSchema);
		
		// consolidate cacheUpdateResults into a single object, (e.g. { Outputs: { TotalChanges: 10, TotalChangesSuccess: 10, TotalChangesFailed: 0 } })
		const consolidatedCacheUpdateResults = this.consolidateTargetOutputResults(cacheUpdateResults);

		console.log("Cache update completed.");

		return consolidatedCacheUpdateResults;
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
	 * Update the cache for a specific schema.
	 * @param {string} schemaName - The schema name. 
	 * @returns {Promise<{ Outputs: { [key: string]: number }}>} - The crawler outputs.
	 */
	protected async updateCacheForSchema(schemaName: string): Promise<{ Outputs: { [key: string]: number }}>
	{
		let crawlerOutput: { Outputs: { [key: string]: number }} = { Outputs: {}};

		const modifiedObjects = this.schemaNameToModifiedObjects.get(schemaName);
		if (modifiedObjects)
		{
			const cacheUpdateResults: CacheUpdateResult[] = await this.cacheService.updateCache(modifiedObjects);
			console.log("Cache updated.");

			crawlerOutput = this.constructCrawlerOutputs(cacheUpdateResults, schemaName);
			console.log("Crawler outputs constructed:", JSON.stringify(crawlerOutput));
		}
		else // should never happen
		{
			console.error(`Modified objects for schema ${schemaName} not found`);
			crawlerOutput = { Outputs: {} };
		}

		return crawlerOutput;
	}


	/**
    * Populate the modified objects set with the modified objects from the request.
    * @returns { void }
    */
	protected populateModifiedObjectsSet(): void
	{
		console.log("Constructing modified objects...");

		const pageToUpdate = this.changeModificationDateTimeToObjectModificationDateTime();

		// Using a Map to efficiently store unique ObjectSourceSchema names and corresponding IModifiedObjects
		this.schemaNameToModifiedObjects = pageToUpdate.reduce((map, entry) => 
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
			schemaModifiedObjects?.Updates.push(this.removeObjectSourceSchemaProperty([entry])[0]);

			// Return the updated Map for the next iteration
			return map;
		}, new Map<string, IModifiedObjects>());

		console.log("Modified objects constructed.");
	}

	/**
     * Change the ModificationDateTime property to ObjectModificationDateTime.
     * @returns { any[] } - The modified page.
     */
	protected changeModificationDateTimeToObjectModificationDateTime(): any[] 
	{
		console.log("Changing ModificationDateTime to ObjectModificationDateTime...");

		return this.request.body.Page.map((entry: any) => 
		{
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
	protected removeObjectSourceSchemaProperty(pageToUpdate: any[]): any[] 
	{
		return pageToUpdate.map((entry: any) => 
		{
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
