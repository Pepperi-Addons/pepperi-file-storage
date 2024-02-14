import { CacheChangesInput, CacheObject } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { ModifiedObjectNotification } from "../entities";

export class PnsToCacheChangesInputConverter
{
	constructor(protected pnsNotification: ModifiedObjectNotification) 
	{}

	public convert(): CacheChangesInput
	{
		const result: CacheChangesInput = {
			SourceAddonUUID: PfsAddonUUID,
			SchemeAddonUUID: PfsAddonUUID,
			SchemeName: this.pnsNotification.FilterAttributes.Resource,
			Updates: this.processModifiedObjects(),
		};

		return result;
	}

	protected processModifiedObjects(): CacheObject[]
	{
		const modifiedObjects = this.pnsNotification.Message.ModifiedObjects;
		
		return modifiedObjects.map((obj) => 
		{
			const updatedObject: CacheObject = {
				Key: obj.ObjectKey,
				ObjectModificationDateTime: obj.ObjectModificationDateTime,
			};

			const hiddenField = obj.ModifiedFields.find((field: any) => field.FieldID === "Hidden");
			if (hiddenField) 
			{
				updatedObject.Hidden = hiddenField.NewValue;
			}

			return updatedObject;
		});
	}
}
