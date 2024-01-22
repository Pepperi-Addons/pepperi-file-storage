import { AddonData, PapiClient, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";

import { NucCacheService } from "./nuc-cache.service";
import docDbDal from "../DAL/docDbDal";
import { ICacheService, IModifiedObjects } from "./entities";
import { BaseCacheUpdateErrorHandler } from "./update-cache/error-handlers/base-cache-update-error-handler";


export class SyncSourceService 
{
	protected cacheService: ICacheService;
	protected pepperiDal: docDbDal;

	constructor(protected papiClient: PapiClient, protected errorHandler: BaseCacheUpdateErrorHandler, pepperiDal?: docDbDal)
	{
		this.cacheService = new NucCacheService(this.papiClient);
		this.pepperiDal = pepperiDal || new docDbDal(this.papiClient);
	}

	public async updateCache(modifiedObjects: IModifiedObjects): Promise<any>
	{    
		// modifiedObject that has a Hidden field should be validated against the actual schema's data,
		// to ensure the latest value of the Hidden field is used.
		await this.getUpToDateHiddenFields(modifiedObjects);
        
		let result;

		try
		{
			result = await this.cacheService.updateCache(modifiedObjects);
		}
		catch (error)
		{
			await this.errorHandler.handle(error);
		}

		return result;
	}

	/**
 * Set the Hidden field of the modifiedObjects to the up-to-date value.
 * 
 * @param { IModifiedObjects } modifiedObjects - The modifiedObjects to update.
 */
	protected async getUpToDateHiddenFields(modifiedObjects: IModifiedObjects): Promise<void>
	{
		// Filter out objects with defined Hidden field
		const objectsWithHiddenField = modifiedObjects.Updates.filter(update => update.Hidden !== undefined);

		// Retrieve up-to-date Hidden values from the database
		const searchBody: SearchBody = {
			KeyList: objectsWithHiddenField.map(update => update.Key),
			Fields: ["Hidden", "Key", "ModificationDateTime"]
		};
		const upToDateHiddenValues: SearchData<AddonData> = await this.pepperiDal.searchDataInTable(modifiedObjects.SchemeName, searchBody);

		// Create a map of the up-to-date Hidden values for faster lookup
		const upToDateHiddenValuesMap = new Map(upToDateHiddenValues.Objects.map(obj => [obj.Key, obj]));

		// Update the modifiedObjects with up-to-date Hidden and ObjectModificationDateTime values
		modifiedObjects.Updates.forEach(update => 
		{
			const upToDateHiddenObject = upToDateHiddenValuesMap.get(update.Key);

			if (upToDateHiddenObject)
			{
				// Update Hidden field if different
				if (update.Hidden !== upToDateHiddenObject.Hidden)
				{
					update.Hidden = upToDateHiddenObject.Hidden;
				}

				// Update ObjectModificationDateTime if different
				if (update.ObjectModificationDateTime !== upToDateHiddenObject.ModificationDateTime)
				{
					update.ObjectModificationDateTime = upToDateHiddenObject.ModificationDateTime!;
				}
			}
		});
	}
}
