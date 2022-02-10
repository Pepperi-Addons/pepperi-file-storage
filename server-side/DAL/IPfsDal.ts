export interface IPfsDal
{
    uploadFileData(Key: string, Body: Buffer): Promise<any>;

    uploadFileMetadata(metadata: any, doesFileExist: boolean): Promise<any>;

    downloadFileMetadata(Key: string): Promise<any>;

    listFolderContents(FolderName: string): Promise<any>;
    
    generatePreSignedURL(Key: string): Promise<any>;
}