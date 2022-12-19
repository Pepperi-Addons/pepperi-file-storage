import { TransactionType } from "./constants";

export interface IPfsMutator
{
	/**
     * Delete the given file's given VersionID.
     * @param Key The key whose version is to be deleted.
     * @param s3FileVersion The version to be deleted.
     */
    deleteS3FileVersion(Key: any, s3FileVersion: any);
    
    /**
     * Returns the lock data if the key is locked, null otherwise.
     * @param relativeKey the key to check.
     */
    isObjectLocked(relativeKey: string);
     
    /**
     * Lock the item.
     * @param relativeKey the key to be locked.
     * @param transactionType the type of transaction.
     */
    lock(key: string, transactionType: TransactionType);

    /**
     * Save the given data on the lock. This data will be later used in case a rollback is executed.
     * @param item the item's data to be saved.
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
     * Invalidate the CDN cached version of the given file.
     * @param file The file whose CDN cached version is to be invalidated.
     */
    invalidateCDN(file: any);

    /**
     * Return the maximal lock time
     */
    getMaximalLockTime();

    /**
     * Batch deletes the received keys from S3. Any thumbnails that are referenced by these keys will also be deleted.
     * @param keys The array of keys to delete
     */
    batchDeleteS3(keys: Array<string>);
}
