import { 
    PutObjectCommandOutput,
    DeleteObjectsCommandOutput,
    DeleteObjectCommandOutput
} from "@aws-sdk/client-s3";
import { PromiseResult } from "aws-sdk/lib/request";

export interface IAws
{
    s3Upload(params: {
        Bucket?: string,
        Key: string,
        Body: any, 
        ContentType: string,
        CacheControl?: string
    }): Promise<PutObjectCommandOutput>;

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

    s3DeleteObjects(objectsPaths: Array<string>): Promise<DeleteObjectsCommandOutput>;

    s3DeleteObject(objectsPath: string): Promise<DeleteObjectCommandOutput>;

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
    @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#createMultipartUpload-property
    @example
    const uploadRes = await s3.createMultipartUpload('myKey');
    console.log(uploadRes);
    // {
    //   Bucket: 'myBucket',
    //   Key: 'myKey',
    //   UploadId: 'myUploadId'
    // }
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
    @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#uploadPartCopy-property
    @example
    const copyRes = await s3.copyUploadPart('myKey', 'myUploadId', 1, 'myBucket/myObject');
    console.log(copyRes);
    // {
    //   CopyPartResult: {
    //     ETag: 'myETag',
    //     LastModified: 2021-03-01T00:00:00.000Z
    //   },
    //   CopySourceVersionId: 'myVersionId',
    //   RequestCharged: 'requester',
    // }
    */
    copyUploadPart(key: string, uploadId: string, partNumber: number, copySource: string): Promise<PromiseResult<AWS.S3.UploadPartCopyOutput, AWS.AWSError>>;

    /**
    Completes a multipart upload by assembling previously uploaded parts into a single object and creates the object in Amazon S3.
    @param {string} key - The key under which the multipart upload was initiated.
    @param {string} uploadId - The ID of the multipart upload.
    @param {AWS.S3.CompletedPart[]} parts - An array of CompletedPart data types that identifies the individual parts that were uploaded.
    @return {Promise<PromiseResult<AWS.S3.CompleteMultipartUploadOutput, AWS.AWSError>>} - A Promise that returns a PromiseResult object containing the response data from Amazon S3 or an error.
    @throws {AWS.AWSError} - Throws an error if the completion of multipart upload fails.
    @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#completeMultipartUpload-property
    @example
    const completeRes = await s3.completeMultipartUpload('myKey', 'myUploadId', [
        {
            ETag: 'myETag',
            PartNumber: 1
        }
    ]);
    console.log(completeRes);
    // {
    //   Location: 'https://myBucket.s3.amazonaws.com/myKey',
    //   Bucket: 'myBucket',
    //   Key: 'myKey',
    //   Expiration: '2021-03-01T00:00:00.000Z',
    //   ETag: '"myETag"',
    //   ServerSideEncryption: 'AES256',
    //   VersionId: 'myVersionId',
    // }
    */
    completeMultipartUpload(key: string, uploadId: string, parts: AWS.S3.CompletedPart[]): Promise<PromiseResult<AWS.S3.CompleteMultipartUploadOutput, AWS.AWSError>>;

    /**
	 * Aborts a multipart upload.
	 * @param key The key of the object to abort the upload of.
	 * @param uploadId The upload ID of the multipart upload to abort.
	 * @returns The result of the abort operation.
	 * @throws An error if the abort operation fails.
	 * 
	 * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#abortMultipartUpload-property
	 * @example
	 * const abortRes = await s3.abortMultipartUpload('myKey', 'myUploadId');
	 * console.log(abortRes);
	 * // {
	 * //   RequestCharged: 'requester',
	 * //   AbortDate: 2021-03-01T00:00:00.000Z,
	 * //   AbortRuleId: 'myRuleId'
	 * // }
	 * 
	 */
	abortMultipartUpload(key: string, uploadId: string): Promise<PromiseResult<AWS.S3.AbortMultipartUploadOutput, AWS.AWSError>>

}
