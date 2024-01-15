export interface IModifiedObjects
{
    SourceAddonUUID: string;
    AddonUUID: string;
    SchemeName: string;
    Updates: UpdatedObject[];
}

export interface UpdatedObject {
    Key: string;
    ObjectModificationDateTime: string;
    Hidden?: boolean;
}
