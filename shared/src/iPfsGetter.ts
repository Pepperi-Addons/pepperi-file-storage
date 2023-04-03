import { AddonData, SearchBody } from "@pepperi-addons/papi-sdk";

export interface IPfsGetter
{
	/**
     * Returns the S3 VersionId if one exists. Undefined otherwise;
     * @param Key The file's key which VersionId will be returned.
     */
    getObjectS3FileVersion(Key: any);

    /**
     * Get a list of objects (files and folders). Standard Pepperi flags apply (i.e. where clause, include_deleted, etc.).
     */
     getObjects(searchBody?: SearchBody): Promise<AddonData[]>;
}
