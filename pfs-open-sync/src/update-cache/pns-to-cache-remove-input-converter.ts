import { CacheObject, CacheRemoveInput } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { ModifiedObjectNotification } from "../entities";

export class PnsToCacheRemoveInputConverter
{
	protected readonly notificationActionType = "remove";	

	public convert(pnsNotification: ModifiedObjectNotification): CacheRemoveInput
	{
		this.validateNotificationActionType(pnsNotification);

		const result: CacheRemoveInput = {
			SourceAddonUUID: PfsAddonUUID,
			SchemeAddonUUID: PfsAddonUUID,
			SchemeName: pnsNotification.FilterAttributes.Resource,
			Keys: this.getRemovedObjectsKeys(pnsNotification), 
		};

		return result;
	}

	protected validateNotificationActionType(pnsNotification: ModifiedObjectNotification): void
	{
		if(pnsNotification.FilterAttributes.Action !== this.notificationActionType)
		{
			throw new Error(`Invalid notification action type: ${pnsNotification.FilterAttributes.Action}, expected: ${this.notificationActionType}`);
		}
	}

	protected getRemovedObjectsKeys(pnsNotification: ModifiedObjectNotification): string[]
	{
		const modifiedObjects = pnsNotification.Message.ModifiedObjects;
		return modifiedObjects.map((obj) => obj.ObjectKey);
	}
}
