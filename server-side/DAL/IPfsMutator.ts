export interface IPfsMutator
{
    /**
     * Write needed changes to S3 bucket - create a new file if needed, update file data, update or create file's thumbnails, etc.
     * @param newFileFields The new file data and metada.
     * @param existingFile The previous file's metadata.
     */
    mutateS3(newFileFields: any, existingFile: any);

    /**
     * 
     * @param newFileFields Write needed changes to ADAL table - create a new ADAL record if needed, update file metadata.
     * @param existingFile 
     */
    mutateADAL(newFileFields: any, existingFile: any);
}