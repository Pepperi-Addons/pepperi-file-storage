import { Request } from "@pepperi-addons/debug-server/dist";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json";
import { IModifiedObjects, UpdatedObject } from "./i-modified-objects";

export class ModifiedObjects implements IModifiedObjects 
{
	public SourceAddonUUID: string;
	public AddonUUID: string;
	public SchemeName: string;
	public Updates: UpdatedObject[];
  
	constructor(request: Request)
	{
		this.SourceAddonUUID = PfsAddonUUID;
		this.AddonUUID = PfsAddonUUID;
		this.SchemeName = request.body.FilterAttributes.Resource;
		this.Updates = this.processModifiedObjects(request.body.Message.ModifiedObjects);
	}
    
	protected processModifiedObjects(modifiedObjects: any[]): UpdatedObject[]
	{
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
