import { AddonData } from "@pepperi-addons/papi-sdk";

export interface IPfsGetter
{
	/**
     * Returns the S3 VersionId if one exists. Undefined otherwise;
     * @param Key The file's key which VersionId will be returned.
     */
    getObjectS3FileVersion(Key: any);
    
    /**
     * Download the file's metadata.
     * @param Key The file's key which metadata will be downloaded.
     */
    downloadFileMetadata(Key: string): Promise<any>;

    /**
     * Get a list of objects (files and folders) under the requested folder.
     * @param FolderName The folder's content to be listed.
     */
    listFolderContents(FolderName: string): Promise<any>;

    /**
     * Get a list of objects (files and folders). Standard Pepperi flags apply (i.e. where clause, include_deleted, etc.).
     */
     getObjects(): Promise<AddonData[]>;

}