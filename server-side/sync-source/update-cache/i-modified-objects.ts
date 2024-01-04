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

export interface CacheUpdateResult {
        InternalID: number;
        UUID: string;
        ExternalID: string;
        Status: "Insert" | "Update" | "Ignore" | "Error";
        Message: string;
        URI: string;
}