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

    getFileSize(key: string): Promise<number>;

    /**
    Creates a new S3 multipart upload with the specified key in the S3 bucket associated with this instance of the S3Service.
    @param key - The key of the object being uploaded.
    @returns A Promise that resolves with the result of the createMultipartUpload() method from the AWS.S3 SDK.
    If an error occurs, the Promise will be rejected with an AWS.AWSError object.
    @throws If the createMultipartUpload() method from the AWS.S3 SDK throws an error, it will be rethrown by this method.
    */
    createMultipartUpload(key: string): Promise<PromiseResult<AWS.S3.CreateMultipartUploadOutput, AWS.AWSError>>;

    /**
    Copies a part of a multipart upload of a file from a given source to a given destination.
    @param key - The destination key of the file.
    @param uploadId - The ID of the multipart upload.
    @param partNumber - The part number of the part to be copied.
    @param copySource - The source of the part to be copied in the form of "bucket/object".
    @returns A Promise that resolves to the result of the uploadPartCopy API call.
    @throws An error if there was an issue copying the upload part.
    */
    copyUploadPart(key: string, uploadId: string, partNumber: number, copySource: string): Promise<PromiseResult<AWS.S3.UploadPartCopyOutput, AWS.AWSError>>;

    /**
    Completes a multipart upload by assembling previously uploaded parts into a single object and creates the object in Amazon S3.
    @param {string} key - The key under which the multipart upload was initiated.
    @param {string} uploadId - The ID of the multipart upload.
    @param {AWS.S3.CompletedPart[]} parts - An array of CompletedPart data types that identifies the individual parts that were uploaded.
    @return {Promise<PromiseResult<AWS.S3.CompleteMultipartUploadOutput, AWS.AWSError>>} - A Promise that returns a PromiseResult object containing the response data from Amazon S3 or an error.
    @throws {AWS.AWSError} - Throws an error if the completion of multipart upload fails.
    */
    completeMultipartUpload(key: string, uploadId: string, parts: AWS.S3.CompletedPart[]): Promise<PromiseResult<AWS.S3.CompleteMultipartUploadOutput, AWS.AWSError>>;



}
