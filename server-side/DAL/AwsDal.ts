import { IAws } from "pfs-shared";
// import AWS from "aws-sdk";
// import { PromiseResult } from "aws-sdk/lib/request";
import URL from "url-parse";
import { 
	PutObjectCommandOutput,
	PutObjectCommand,
	PutObjectCommandInput,
	DeleteObjectsCommand,
	DeleteObjectsCommandOutput,
	DeleteObjectCommand,
	DeleteObjectCommandInput,
	DeleteObjectCommandOutput,
	ListObjectVersionsCommand,
	ListObjectVersionsCommandInput,
	ListObjectVersionsCommandOutput,
	S3Client 
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";


export default class AwsDal implements IAws
{

	constructor(private S3Bucket: string, private CloudFrontDistribution: string, private s3: S3Client)
	{
	}

	public async s3Upload(params: {
        Bucket?: string,
        Key: string,
        Body: any, 
        ContentType: string,
        CacheControl?: string
    }): Promise<PutObjectCommandOutput>
	{			
		const uploadParams: PutObjectCommandInput = {
			Bucket: params.Bucket ?? this.S3Bucket,
			Key: params.Key,
			Body: params.Body,
			ContentType: params.ContentType,
			...(params.CacheControl && {CacheControl: params.CacheControl})
		};

		const uploadCommand = new PutObjectCommand(uploadParams);

		const uploaded = await this.s3.send(uploadCommand);
		return uploaded;
	}

	public async s3GetSignedUrl(params: {
        Bucket?: string,
        Key: string,
        Expires?: number, //PUT presigned URL will expire after 24 hours = 60 sec * 60 min * 24 hrs
        ContentType?: string
    }): Promise<string>
	{			
		params.Bucket = params.Bucket ?? this.S3Bucket;
		params.Expires = params.Expires ?? 24 * 60 * 60; //PUT presigned URL will expire after 24 hours = 60 sec * 60 min * 24 hrs

		const command = new PutObjectCommand({ Bucket: params.Bucket, Key: params.Key, ContentType: params.ContentType});
  		return getSignedUrl(this.s3, command, { expiresIn: 3600 });
	}

	public async s3DeleteObjects(objectsPaths: Array<string>): Promise<DeleteObjectsCommandOutput>
	{
		const params: AWS.S3.DeleteObjectsRequest = {
			Bucket: this.S3Bucket,
			Delete: {
				Objects: objectsPaths.map(key => ({Key: key})),
				Quiet: true	// Non verbose, returns info only for failed deletes.
			}
		};

		const deleteObjectsCommand = new DeleteObjectsCommand({
			Bucket: params.Bucket,
			Delete: {
				Objects: objectsPaths.map(key => ({Key: key})),
				Quiet: true	// Non verbose, returns info only for failed deletes.
			}
		});
		// For more information on S3's deleteObjects function see: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
		const deleteObjectsRes = await this.s3.send(deleteObjectsCommand);
		return deleteObjectsRes;
	}

	public async s3DeleteObject(objectsPath: string): Promise<DeleteObjectCommandOutput>
	{
		const params: DeleteObjectCommandInput = {
			Bucket: this.S3Bucket,
			Key: objectsPath
		};

		const deleteObjectCommand = new DeleteObjectCommand(params);
		
		// delete thumbnail from S3 bucket.
		const deleted = await this.s3.send(deleteObjectCommand);

		return deleted;
	}

	public async s3ListObjectVersions(objectPath: string): Promise<ListObjectVersionsCommandOutput>
	{
		const params: ListObjectVersionsCommandInput = {
			Bucket: this.S3Bucket,
		    Prefix: objectPath
		};
		
		const listObjectVersionsCommand = new ListObjectVersionsCommand(params);

		const allVersions = await this.s3.send(listObjectVersionsCommand);
		return allVersions;
	}

	public async cloudFrontInvalidate(objectsPath: string[]): Promise<PromiseResult<AWS.CloudFront.CreateInvalidationResult, AWS.AWSError>>
	{
		// Create invalidation request
		const cloudfront = new AWS.CloudFront({apiVersion: "2020-05-31"});
		const invalidationParams: AWS.CloudFront.CreateInvalidationRequest = {
			DistributionId: this.CloudFrontDistribution,
  			InvalidationBatch: {
				CallerReference: (new Date()).getTime().toString(), //A unique string to represent each invalidation request.
				Paths: { 
					Quantity: objectsPath.length, 
					Items: objectsPath
				}
  			}
		};

		const invalidation = await cloudfront.createInvalidation(invalidationParams).promise();

		return invalidation;
	}

	public async copyS3Object(originURL: string, destinationKey: string, cacheControl: boolean | undefined): Promise<PromiseResult<AWS.S3.CopyObjectOutput, AWS.AWSError>>
	{
		const copyParams: AWS.S3.CopyObjectRequest = {
			Bucket: this.S3Bucket,
			CopySource: encodeURI(`/${this.S3Bucket}${new URL(originURL).pathname}`),
			Key: destinationKey,
			...(!cacheControl && {CacheControl: "no-cache"}),
		};

		console.log(`Trying to copy object from ${originURL} to ${destinationKey}...`);
		console.log(JSON.stringify(copyParams));

		let copyRes: PromiseResult<AWS.S3.CopyObjectOutput, AWS.AWSError>;
		try
		{
			copyRes = await this.s3.copyObject(copyParams).promise();
		}
		catch (err)
		{
			console.error(`Error copying object from ${originURL} to ${destinationKey}: ${err instanceof Error ? err.message : "An unknown error occurred"}`);
			throw err;
		}

		console.log(`Copied object from ${originURL} to ${destinationKey}`);

		return copyRes;
	}

	public async getFileSize(key: string): Promise<number>
	{
		const params: AWS.S3.HeadObjectRequest = {
			Bucket: this.S3Bucket,
			Key: key
		};
		let headRes: PromiseResult<AWS.S3.HeadObjectOutput, AWS.AWSError>;
		try
		{
			headRes = await this.s3.headObject(params).promise();
		}
		catch (err)
		{
			console.error(`Error getting file size of ${key}: ${err instanceof Error ? err.message : "An unknown error occurred"}`);
			throw err;
		}

		console.log(`Got file size of ${key}`);

		return headRes.ContentLength ?? 0;
	}

	public async createMultipartUpload(key: string): Promise<PromiseResult<AWS.S3.CreateMultipartUploadOutput, AWS.AWSError>>
	{
		console.log(`Trying to create multipart upload of ${key}...`);
		const params: AWS.S3.CreateMultipartUploadRequest = {
			Bucket: this.S3Bucket,
			Key: key
		};
		let createRes: PromiseResult<AWS.S3.CreateMultipartUploadOutput, AWS.AWSError>;
		try
		{
			createRes = await this.s3.createMultipartUpload(params).promise();
		}
		catch (err)
		{
			console.error(`Error creating multipart upload of ${key}: ${err instanceof Error ? err.message : "An unknown error occurred"}`);
			throw err;
		}

		console.log(`Created multipart upload of ${key}`);
		return createRes;
	}

	public async copyUploadPart(key: string, uploadId: string, partNumber: number, copySource: string): Promise<PromiseResult<AWS.S3.UploadPartCopyOutput, AWS.AWSError>>
	{
		const params: AWS.S3.UploadPartCopyRequest = {
			Bucket: this.S3Bucket,
			Key: key,
			UploadId: uploadId,
			PartNumber: partNumber,
			CopySource: encodeURI(`/${this.S3Bucket}${new URL(copySource).pathname}`),
		};
		let copyRes: PromiseResult<AWS.S3.UploadPartCopyOutput, AWS.AWSError>;

		console.log(`Trying to copy upload part number ${partNumber} of "${key}" from "${copySource}"...`);
		try
		{
			copyRes = await this.s3.uploadPartCopy(params).promise();
		}
		catch (err)
		{
			console.error(`Error copying upload part number ${partNumber} of "${key}" from "${copySource}": ${err instanceof Error ? err.message : "An unknown error occurred"}`);
			throw err;
		}

		console.log(`Copied upload part #${partNumber} of "${key}" from "${copySource}".`);
		return copyRes;
	}

	public async completeMultipartUpload(key: string, uploadId: string, parts: AWS.S3.CompletedPart[]): Promise<PromiseResult<AWS.S3.CompleteMultipartUploadOutput, AWS.AWSError>>
	{
		const params: AWS.S3.CompleteMultipartUploadRequest = {
			Bucket: this.S3Bucket,
			Key: key,
			UploadId: uploadId,
			MultipartUpload: {
				Parts: parts
			}
		};
		let completeRes: PromiseResult<AWS.S3.CompleteMultipartUploadOutput, AWS.AWSError>;

		console.log(`Trying to complete multipart upload of ${key}...`);
		try
		{
			completeRes = await this.s3.completeMultipartUpload(params).promise();
		}
		catch (err)
		{
			console.error(`Error completing multipart upload of ${key}: ${err instanceof Error ? err.message : "An unknown error occurred"}`);
			throw err;
		}

		console.log(`Completed multipart upload of ${key}`);
		return completeRes;
	}

	public async abortMultipartUpload(key: string, uploadId: string): Promise<PromiseResult<AWS.S3.AbortMultipartUploadOutput, AWS.AWSError>>
	{
		const params: AWS.S3.AbortMultipartUploadRequest = {
			Bucket: this.S3Bucket,
			Key: key,
			UploadId: uploadId
		};
		let abortRes: PromiseResult<AWS.S3.AbortMultipartUploadOutput, AWS.AWSError>;

		console.log(`Trying to abort multipart upload of ${key}...`);
		try
		{
			abortRes = await this.s3.abortMultipartUpload(params).promise();
		}
		catch (err)
		{
			console.error(`Error aborting multipart upload of ${key}: ${err instanceof Error ? err.message : "An unknown error occurred"}`);
			throw err;
		}

		console.log(`Aborted multipart upload of ${key}`);
		return abortRes;
	
	}
}
