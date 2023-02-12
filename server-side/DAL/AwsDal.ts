import { IAws } from "pfs-shared";


const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundantly.


export default class AwsDal implements IAws
{

	constructor(private S3Bucket: string, private CloudFrontDistribution: string, private s3: any)
	{
	}

    public async s3Upload(params: {
        Bucket?: string,
        Key: string,
        Body: any, 
        ContentType: string,
        CacheControl?: string
    }): Promise<any>
    {			
        params.Bucket = params.Bucket ?? this.S3Bucket;

		const uploaded = await this.s3.upload(params).promise();
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

    public async s3DeleteObjects(objectsPaths: Array<string>): Promise<any>
	{

		const params = {
			Bucket: this.S3Bucket,
			Delete: {
				Objects: objectsPaths.map(key => ({Key: key})),
				Quiet: true	// Non verbose, returns info only for failed deletes.
			}
		};

		// For more information on S3's deleteObjects function see: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
		const deleteObjectsRes = await this.s3.deleteObjects(params).promise();
		return deleteObjectsRes;
	}

    public async s3DeleteObject(objectsPath: string): Promise<any>
	{
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = objectsPath;
		
		// delete thumbnail from S3 bucket.
		const deleted = await this.s3.deleteObject(params).promise();

		return deleted;
	}

    public async s3ListObjectVersions(objectPath: string): Promise<any>
	{
		const params = {
            Bucket: this.S3Bucket,
		    Prefix: objectPath
        }
		
        const allVersions = await this.s3.listObjectVersions(params).promise();
		return allVersions;
	}

    public async cloudFrontInvalidate(objectsPath: string[]): Promise<any>
    {
        // Create invalidation request
		const cloudfront = new AWS.CloudFront({apiVersion: '2020-05-31'});
		const invalidationParams = {
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

}
