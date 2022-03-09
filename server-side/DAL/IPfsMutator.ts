export interface IPfsMutator
{
    /**
     * Returns the lock data if the key is locked, null otherwise.
     * @param relativeKey the key to check.
     */
     isObjectLocked(relativeKey: string);
     
    /**
     * Lock the item.
     * @param relativeKey the key to be locked.
     */
    lock(key: string);

    /**
     * Lock the item.
     * @param item the item to be locked/
     */
     setRollbackData(item: any);

    /**
     * Write needed changes to S3 bucket - create a new file if needed, update file data, update or create file's thumbnails, etc.
     * @param newFileFields The new file data and metadata.
     * @param existingFile The previous file's metadata.
     */
    mutateS3(newFileFields: any, existingFile: any);

    /**
     * 
     * @param newFileFields Write needed changes to ADAL table - create a new ADAL record if needed, update file metadata.
     * @param existingFile 
     */
    mutateADAL(newFileFields: any, existingFile: any);

    /**
     * Notify subscribers of changes in file data or metadata.
     * @param newFileFields The new file data and metadata.
     * @param existingFile The previous file's metadata.
     */
    notify(newFileFields: any, existingFile: any);

    /**
     * Unlock the requested key.
     * @param relativeKey The key to be unlocked
     */
    unlock(relativeKey: string);

    /**
     * Invalidate the CDN cached version of the requested key.
     * @param relativeKey The key whose CDN cached version is to be invalidated.
     */
    invalidateCDN(relativeKey: string);
}