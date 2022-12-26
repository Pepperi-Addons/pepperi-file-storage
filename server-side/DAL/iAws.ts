export interface IAws
{
    s3Upload(params: {
        Bucket?: string,
        Key: string,
        Body: any, 
        ContentType: string,
        CacheControl?: string
    }): Promise<any>;

    s3GetSignedUrl(params: {
        Bucket?: string,
        Key: string,
        Expires?: number,
        ContentType: string
    }): Promise<string>;

    s3DeleteObjects(objectsPaths: Array<string>): Promise<any>;

    s3DeleteObject(objectsPath: string): Promise<any>;

    s3ListObjectVersions(objectPath: string): Promise<any>;

    cloudFrontInvalidate(objectsPath: string[]): Promise<any>;
}
