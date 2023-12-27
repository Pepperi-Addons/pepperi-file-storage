export interface IModifiedObjects
{
    SourceAddonUUID: string;
    AddonUUID: string;
    SchemeName: string;
    Updates: Array<{ Key: string; ObjectModificationDateTime: string; Hidden?: boolean }>;
}