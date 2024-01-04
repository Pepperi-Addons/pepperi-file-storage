import { Request } from "@pepperi-addons/debug-server/dist";
import { SearchData, AddonData, SearchBody } from "@pepperi-addons/papi-sdk";

import docDbDal from "../../DAL/docDbDal";


export interface CrawlerPageKey {
    SchemaIndex: number;
    SpecificSchemaPageKey?: string;
}


export class CrawlingSourceService
{
	constructor(protected docDbDal: docDbDal, protected request: Request)
	{}

	/**
     * Get the next page of data to crawl.
     * @returns {Promise<SearchData<AddonData>>} The next page of data to crawl.
     */
	public async getNextPage(): Promise<SearchData<AddonData>>
	{
		console.log("Getting the next page...");

		const pageKey: CrawlerPageKey = this.parsePageKey();
		console.log("Parsed page key:", pageKey);

		const searchBody: SearchBody = {
			PageKey: pageKey.SpecificSchemaPageKey,
			Fields: ["Key", "Hidden", "ModificationDateTime"],
			IncludeDeleted: true,
		};

		const schemaName = this.request.body.SchemaNames[pageKey.SchemaIndex];
		console.log("Fetching data from schema:", schemaName);

		const result = await this.docDbDal.searchDataInTable(schemaName, searchBody);
		console.log("Data fetched.");

		// Since we can't pass to the crawl target the actual schema from which the data was taken,
		// a transformation of the objects is required.
		this.formatResult(result, schemaName, pageKey);

		console.log("Next page retrieved.");

		return result;
	}

	/**
     * Format the result to be passed to the crawl target.
     * @param {SearchData<AddonData>} result - The result to format.
     * @param {string} schemaName - The name of the schema from which the data was taken.
     * @param {CrawlerPageKey} currentPageKey - The page key of the current crawler page.
     */
	protected formatResult(result: SearchData<AddonData>, schemaName: string, currentPageKey: CrawlerPageKey): void
	{
		console.log("Formatting result...");

		this.setOriginSchemaOnObjects(result, schemaName);
		this.setNextPageKey(result, currentPageKey);

		console.log("Result formatted.");
	}

	protected setOriginSchemaOnObjects(result: SearchData<AddonData>, schemaName: string)
	{
		console.log("Setting origin schema on objects...");

		result.Objects.forEach(object => 
		{
			object["ObjectSourceSchema"] = schemaName;
		});

		console.log("Origin schema set on objects.");
	}

	/**
     * Set the next page key on the result.
     * @param {SearchData<AddonData>} result - The result to set the next page key on.
     * @param {CrawlerPageKey} currentCrawlerPageKey - The page key of the current crawler page.
     */
	protected setNextPageKey(result: SearchData<AddonData>, currentCrawlerPageKey: CrawlerPageKey): void
	{
		console.log("Setting next page key...");

		const nextPageKey: CrawlerPageKey = {
			SchemaIndex: currentCrawlerPageKey.SchemaIndex,
			SpecificSchemaPageKey: "",
		};

		// If there is a next page key, on the same schema, use it.
		if (result.NextPageKey)
		{
			nextPageKey.SpecificSchemaPageKey = result.NextPageKey;
			result.NextPageKey = JSON.stringify(nextPageKey);
		}
		// If there is no next page key, and there are more schemas to crawl, use the next schema.
		else if(currentCrawlerPageKey.SchemaIndex + 1 < this.request.body.SchemaNames.length)
		{
			nextPageKey.SchemaIndex++;
			result.NextPageKey = JSON.stringify(nextPageKey);
		}
		// If there is no next page key, and there are no more schemas to crawl, use an empty string
		// to indicate that there are no more pages.
		else
		{
			result.NextPageKey = "";
		}

		console.log("Next page key set:", JSON.stringify(result.NextPageKey));
	}

	/**
     * Parse the page key from the request.
     * @returns {CrawlerPageKey} The parsed crawler page key.
     */
	protected parsePageKey(): CrawlerPageKey
	{
		console.log("Parsing page key...");

		const result: CrawlerPageKey = { SchemaIndex: 0, SpecificSchemaPageKey: "" };

		const passedPageKey: string = this.request.body.PageKey;
		if (passedPageKey)
		{
			const parsedPageKey: CrawlerPageKey = JSON.parse(passedPageKey);

			result.SchemaIndex = parsedPageKey.SchemaIndex;
			result.SpecificSchemaPageKey = parsedPageKey.SpecificSchemaPageKey ?? "";

			if (!result.SchemaIndex)
			{
				throw new Error("Error parsing PageKey: SchemaIndex is required");
			}
		}

		console.log("Page key parsed:", JSON.stringify(result));

		return result;
	}
}
