export interface IPfsGetter
{
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
     * Returns the lock data if the key is locked, null otherwise.
     * @param key the key to check.
     */
    isObjectLocked(key: string);
}