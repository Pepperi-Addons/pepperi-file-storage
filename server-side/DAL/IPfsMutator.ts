export interface IPfsMutator
{
    mutateS3(newFileFields: any, existingFile: any);

    mutateADAL(newFileFields: any, existingFile: any);
}