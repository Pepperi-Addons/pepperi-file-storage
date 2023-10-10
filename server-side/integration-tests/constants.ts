import { AddonData } from "@pepperi-addons/papi-sdk";

export const testFileData = "data:image/png;base64,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";


export interface ArbitraryPrefix extends AddonData
{
    Key: string;
    ArbitraryPrefixValue: string;
}