export interface IPfsGetter
{
    downloadFileMetadata(Key: string): Promise<any>;

    listFolderContents(FolderName: string): Promise<any>;
}