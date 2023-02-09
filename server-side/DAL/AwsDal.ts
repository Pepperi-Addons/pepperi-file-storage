import { IAws } from "pfs-shared";
import AWS from 'aws-sdk'; // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundantly.
import { URL } from "url";
import { PromiseResult } from "aws-sdk/lib/request";


export default class AwsDal implements IAws
{

	constructor(private S3Bucket: string, private CloudFrontDistribution: string, private s3: AWS.S3)
	{
	}

	public async s3Upload(params: {
        Bucket?: string,
        Key: string,
        Body: any, 
        ContentType: string,
        CacheControl?: string
    }): Promise<AWS.S3.ManagedUpload.SendData>
	{			
		const uploadParams: AWS.S3.PutObjectRequest = {
			Bucket: params.Bucket ?? this.S3Bucket,
			Key: params.Key,
			Body: params.Body,
			ContentType: params.ContentType,
			...(params.CacheControl && {CacheControl: params.CacheControl})
		};

		const uploaded = await this.s3.upload(uploadParams).promise();
		return uploaded;
	}

	public async s3GetSignedUrl(params: {
        Bucket?: string,
        Key: string,
        Expires?: number, //PUT presigned URL will expire after 24 hours = 60 sec * 60 min * 24 hrs
        ContentType: string
    }): Promise<string>
	{			
		params.Bucket = params.Bucket ?? this.S3Bucket;
		params.Expires = params.Expires ?? 24 * 60 * 60; //PUT presigned URL will expire after 24 hours = 60 sec * 60 min * 24 hrs
		const urlString: string = await this.s3.getSignedUrl('putObject',params);
		return urlString;
	}

	public async s3DeleteObjects(objectsPaths: Array<string>): Promise<PromiseResult<AWS.S3.DeleteObjectsOutput, AWS.AWSError>>
	{
		const params: any = {};

		params.Bucket = this.S3Bucket;

		params['Delete'] = {};
		params.Delete.Quiet = true; // Non verbose, returns info only for failed deletes.
		params.Delete.Objects = objectsPaths;

		// For more information on S3's deleteObjects function see: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
		const deleteObjectsRes = await this.s3.deleteObjects(params).promise();
		return deleteObjectsRes;
	}

	public async s3DeleteObject(objectsPath: string): Promise<PromiseResult<AWS.S3.DeleteObjectOutput, AWS.AWSError>>
	{
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = objectsPath;
		
		// delete thumbnail from S3 bucket.
		const deleted = await this.s3.deleteObject(params).promise();

		return deleted;
	}

	public async s3ListObjectVersions(objectPath: string): Promise<PromiseResult<AWS.S3.ListObjectVersionsOutput, AWS.AWSError>>
	{
		const params = {
			Bucket: this.S3Bucket,
		    Prefix: objectPath
		};
		
		const allVersions = await this.s3.listObjectVersions(params).promise();
		return allVersions;
	}

	public async cloudFrontInvalidate(objectsPath: string[]): Promise<PromiseResult<AWS.CloudFront.CreateInvalidationResult, AWS.AWSError>>
	{
		// Create invalidation request
		const cloudfront = new AWS.CloudFront({apiVersion: '2020-05-31'});
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
			...(!cacheControl && {CacheControl: 'no-cache'}),
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
			console.error(`Error copying object from ${originURL} to ${destinationKey}: ${err instanceof Error ? err.message : 'An unknown error occurred'}`);
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
			console.error(`Error getting file size of ${key}: ${err instanceof Error ? err.message : 'An unknown error occurred'}`);
			throw err;
		}

		console.log(`Got file size of ${key}`);

		return headRes.ContentLength ?? 0;
	}
}