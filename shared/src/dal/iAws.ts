import AWS from 'aws-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';

export interface IAws
{
    s3Upload(params: {
        Bucket?: string,
        Key: string,
        Body: any, 
        ContentType: string,
        CacheControl?: string
    }): Promise<any>;

    /**
    Generates a signed URL for uploading an object to an S3 bucket.
    @async
    @param {object} params - An object containing parameters for the signed URL:
		- Bucket (optional): The name of the S3 bucket to upload the object to.
		- Key: The name of the object to be uploaded.
		- Expires (optional): The time in seconds that the signed URL is valid for (default is 24 hours).
		- ContentType (optional): The content type of the object to be uploaded.
	@returns {Promise<string>} A promise that resolves with a signed URL string that can be used to upload an object to S3.
	*/
    s3GetSignedUrl(params: {
        Bucket?: string,
        Key: string,
        Expires?: number,
        ContentType?: string
    }): Promise<string>;

    s3DeleteObjects(objectsPaths: Array<string>): Promise<any>;

    s3DeleteObject(objectsPath: string): Promise<any>;

    s3ListObjectVersions(objectPath: string): Promise<any>;

    cloudFrontInvalidate(objectsPath: string[]): Promise<any>;

    copyS3Object(originURL: string, destinationKey: string, shouldCache: boolean | undefined): Promise<PromiseResult<AWS.S3.CopyObjectOutput, AWS.AWSError>>;

    getFileSize(key: string): Promise<number>

}
