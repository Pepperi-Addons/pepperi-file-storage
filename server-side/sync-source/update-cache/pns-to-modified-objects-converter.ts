import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { IModifiedObjects, ModifiedObjectNotification, UpdatedObject } from "../entities";

export class PnsToModifiedObjectsConverter
{
	constructor(protected pnsNotification: ModifiedObjectNotification) 
	{}

	public convert(): IModifiedObjects
	{
		const result: IModifiedObjects = {
			SourceAddonUUID: PfsAddonUUID,
			AddonUUID: PfsAddonUUID,
			SchemeName: this.pnsNotification.FilterAttributes.Resource,
			Updates: this.processModifiedObjects(),
		};

		return result;
	}

	protected processModifiedObjects(): UpdatedObject[]
	{
		const modifiedObjects = this.pnsNotification.Message.ModifiedObjects;
		
		return modifiedObjects.map((obj) => 
		{
			const updatedObject: UpdatedObject = {
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
