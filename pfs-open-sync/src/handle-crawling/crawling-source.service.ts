import { SearchData, AddonData, SearchBody, CrawlerSourceOutput } from "@pepperi-addons/papi-sdk";

import { PfsCrawlerSourceInput } from "../entities";
import { DataSearcher } from "../entities/data-searcher";


export interface PfsCrawlerPageKey {
    SchemaIndex: number;
    SpecificSchemaPageKey?: string;
}


export class CrawlingSourceService
{
	constructor(protected crawlerSourceInput: PfsCrawlerSourceInput, protected dataSearcher: DataSearcher)
	{ }

	/**
     * Get the next page of data to crawl.
     * @returns {Promise<CrawlerSourceOutput>} The next page of data.
     */
	public async getNextPage(): Promise<CrawlerSourceOutput>
	{
		console.log("Getting the next page...");

		const pageKey: PfsCrawlerPageKey = this.parsePageKey();
		console.log("Parsed page key:", pageKey);

		const result = await this.getPageFromSchema(pageKey);
		console.log("Data fetched.");

		// Since we can't pass to the crawl target the actual schema from which the data was taken,
		// a transformation of the objects is required.
		this.formatResult(result, pageKey);

		console.log("Next page retrieved.");

		return result as CrawlerSourceOutput;
	}

	protected async getPageFromSchema(pageKey: PfsCrawlerPageKey): Promise<SearchData<AddonData>>
	{
		const schemaName = this.crawlerSourceInput.SchemaNames[pageKey.SchemaIndex];

		const searchBody: SearchBody = {
			PageKey: pageKey.SpecificSchemaPageKey,
			Fields: ["Key", "Hidden", "ModificationDateTime"],
			IncludeDeleted: true,
		};


		console.log("Fetching data from schema:", schemaName);

		const result = await this.dataSearcher.searchDataInTable(schemaName, searchBody);
		return result;
	}

	/**
     * Format the result to be passed to the crawl target.
     * @param {SearchData<AddonData>} result - The result to format.
     * @param {string} schemaName - The name of the schema from which the data was taken.
     * @param {PfsCrawlerPageKey} currentPageKey - The page key of the current crawler page.
     */
	protected formatResult(result: SearchData<AddonData>, currentPageKey: PfsCrawlerPageKey): void
	{
		const schemaName = this.crawlerSourceInput.SchemaNames[currentPageKey.SchemaIndex];
		
		this.setOriginSchemaOnObjects(result, schemaName);
		this.setNextPageKey(result, currentPageKey);
	}

	protected setOriginSchemaOnObjects(result: SearchData<AddonData>, schemaName: string)
	{
		result.Objects.forEach(object => 
		{
			object["ObjectSourceSchema"] = schemaName;
		});
	}

	/**
     * Set the next page key on the result.
     * @param {SearchData<AddonData>} result - The result to set the next page key on.
     * @param {PfsCrawlerPageKey} currentCrawlerPageKey - The page key of the current crawler page.
     */
	protected setNextPageKey(result: SearchData<AddonData>, currentCrawlerPageKey: PfsCrawlerPageKey): void
	{
		let nextPageKey: PfsCrawlerPageKey | undefined = {
			SchemaIndex: currentCrawlerPageKey.SchemaIndex,
			SpecificSchemaPageKey: "",
		};

		// If there is a next page key, on the same schema, use it.
		if (result.NextPageKey)
		{
			nextPageKey.SpecificSchemaPageKey = result.NextPageKey;
		}
		// If there is no next page key, and there are more schemas to crawl, use the next schema.
		else if(currentCrawlerPageKey.SchemaIndex + 1 < this.crawlerSourceInput.SchemaNames.length)
		{
			nextPageKey.SchemaIndex++;
		}
		// If there is no next page key, and there are no more schemas to crawl, use an undefined
		// to indicate that there are no more pages.
		else
		{
			nextPageKey = undefined;
		}

		result.NextPageKey = nextPageKey ? JSON.stringify(nextPageKey) : undefined;
	}

	/**
     * Parse the page key from the request.
     * @returns {PfsCrawlerPageKey} The parsed crawler page key.
     */
	public parsePageKey(): PfsCrawlerPageKey
	{
		const result: PfsCrawlerPageKey = { SchemaIndex: 0, SpecificSchemaPageKey: "" };

		const passedPageKey: string | undefined = this.crawlerSourceInput.PageKey;
		if (passedPageKey)
		{
			const parsedPageKey: PfsCrawlerPageKey = JSON.parse(passedPageKey);

			result.SchemaIndex = parsedPageKey.SchemaIndex;
			result.SpecificSchemaPageKey = parsedPageKey.SpecificSchemaPageKey ?? "";

			if (!result.SchemaIndex)
			{
				throw new Error("Error parsing PageKey: SchemaIndex is required");
			}
		}

		return result;
	}
}
