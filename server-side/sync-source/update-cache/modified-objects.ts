import { Request } from "@pepperi-addons/debug-server/dist";

import { AddonUUID as PfsAddonUUID } from "../../../addon.config.json"
import { IModifiedObjects } from "./i-modified-objects";

export class ModifiedObjects implements IModifiedObjects {
    public SourceAddonUUID: string;
    public AddonUUID: string;
    public SchemeName: string;
    public Updates: Array<{ Key: string; ObjectModificationDateTime: string; Hidden?: boolean }> = [];
  
    constructor(request: Request)
    {
        this.SourceAddonUUID = PfsAddonUUID;
        this.AddonUUID = PfsAddonUUID;
        this.SchemeName = request.body.FilterAttributes.Resource;
        this.Updates = this.processModifiedObjects(request.body.Message.ModifiedObjects);
    }
    
    private processModifiedObjects(modifiedObjects: any[]): { Key: string; ObjectModificationDateTime: string; Hidden?: boolean }[]
    {
        return modifiedObjects.map((obj) => {
            const update: { Key: string; ObjectModificationDateTime: string; Hidden?: boolean } = {
                Key: obj.ObjectKey,
                ObjectModificationDateTime: obj.ObjectModificationDateTime,
            };

            const hiddenField = obj.ModifiedFields.find((field: any) => field.FieldID === 'Hidden');
            if (hiddenField)
            {
                update.Hidden = hiddenField.NewValue;
            }

            return update;
        });
    }
  }

  