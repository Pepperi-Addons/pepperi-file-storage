import { CacheChangesInput, CacheObject } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { ModifiedObjectNotification } from "../entities";

export class PnsToCacheChangesInputConverter
{
	protected readonly notificationActionTypes = ["insert", "update"];

	public convert(pnsNotification: ModifiedObjectNotification): CacheChangesInput
	{
		const result: CacheChangesInput = {
			SourceAddonUUID: PfsAddonUUID,
			SchemeAddonUUID: PfsAddonUUID,
			SchemeName: pnsNotification.FilterAttributes.Resource,
			Updates: this.processModifiedObjects(pnsNotification),
		};

		return result;
	}

	protected validateNotificationActionType(pnsNotification: ModifiedObjectNotification): void
	{
		if(!this.notificationActionTypes.includes(pnsNotification.FilterAttributes.Action))
		{
			throw new Error(`Invalid notification action type: ${pnsNotification.FilterAttributes.Action}, expected: "${this.notificationActionTypes.join(", ")}"`);
		}
	}

	protected processModifiedObjects(pnsNotification: ModifiedObjectNotification): CacheObject[]
	{
		const modifiedObjects = pnsNotification.Message.ModifiedObjects;
		
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
