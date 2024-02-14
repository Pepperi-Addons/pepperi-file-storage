import { CacheObject, CacheRemoveInput } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { ModifiedObjectNotification } from "../entities";

export class PnsToCacheRemoveInputConverter
{
	protected readonly notificationActionType = "remove";

	constructor(protected pnsNotification: ModifiedObjectNotification) 
	{
		this.validateNotificationActionType();
	}
	validateNotificationActionType(): void
	{
		throw new Error("Method not implemented.");
	}

	public convert(): CacheRemoveInput
	{
		const result: CacheRemoveInput = {
			SourceAddonUUID: PfsAddonUUID,
			SchemeAddonUUID: PfsAddonUUID,
			SchemeName: this.pnsNotification.FilterAttributes.Resource,
			Keys: this.getRemovedObjectsKeys(), 
		};

		return result;
	}

	protected getRemovedObjectsKeys(): string[]
	{
		const modifiedObjects = this.pnsNotification.Message.ModifiedObjects;
		return modifiedObjects.map((obj) => obj.ObjectKey);
	}
}
