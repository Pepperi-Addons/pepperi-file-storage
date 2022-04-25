import { Client, Request } from '@pepperi-addons/debug-server';
import { dataURLRegex, S3Buckets, CloudfrontDistributions, NO_CACHE_DEFAULT_VALUE } from "../constants";
import { AbstractBasePfsDal } from './AbstartcBasePfsDal';

const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundently.

export abstract class AbstractS3PfsDal extends AbstractBasePfsDal
{
	private s3: any;
	private S3Bucket: any;
	private CloudfrontDistribution: any;
    
	constructor(client: Client, request: Request, maximalLockTime: number)
	{
		super(client, request, maximalLockTime);

		// const accessKeyId="";
		// const secretAccessKey="";
		// const sessionToken="";
		// AWS.config.update({
		// 	accessKeyId,
		// 	secretAccessKey,
		// 	sessionToken
		// });

		this.s3 = new AWS.S3({apiVersion: '2006-03-01'}); //lock API version
		this.S3Bucket = S3Buckets[this.environment];
		this.CloudfrontDistribution = CloudfrontDistributions[this.environment];
	}

	//#region IPfsMutator
	public async mutateS3(newFileFields: any, existingFile: any){
		if(existingFile.isFileExpired){
			return await this.deleteFileData(existingFile.Key);
		}
		const isNoCache = this.shouldUseNoCache(newFileFields, existingFile);

		if(!this.request.body.URI && !existingFile.doesFileExist) //The file does not yet exist, and no data was provided. Assign a presigned URL for data upload.
		{ 
			newFileFields.PresignedURL = await this.generatePreSignedURL(newFileFields);
		}
		else if (this.request.body.URI) // The file already has data, or data was provided.
		{ 
			const uploadRes = await this.uploadFileData(newFileFields, isNoCache);
			newFileFields.FileVersion = uploadRes.VersionId;
			
			delete newFileFields.buffer;
		}

		if(Array.isArray(newFileFields.Thumbnails)){
            for (const thumbnail of newFileFields.Thumbnails) {
                await this.uploadThumbnail(newFileFields.Key, thumbnail.Size, thumbnail.buffer, isNoCache);
                delete thumbnail.buffer;
            }
            if (Array.isArray(existingFile.Thumbnails)) { //delete unnecessary thumbnails from S3.
                const deletedThumbnails = existingFile.Thumbnails.filter(existingThumbnail => {
                    return !newFileFields.Thumbnails.find(newThumbnail => {
                        return existingThumbnail.Size == newThumbnail.Size;
                    });
                });
                for (const thumbnail of deletedThumbnails) {
                    await this.deleteThumbnail(newFileFields.Key, thumbnail.Size);
                }
            }
        }
	}

	private shouldUseNoCache(newFileFields: any, existingFile: any) {
		let isNoCache = NO_CACHE_DEFAULT_VALUE;

		if (newFileFields.hasOwnProperty('NoCache')) {
			isNoCache = newFileFields.NoCache;
		}
		else if (existingFile.hasOwnProperty('NoCache')) {
			isNoCache = existingFile.NoCache;
		}
		return isNoCache;
	}

	abstract lock(item: any);

	abstract mutateADAL(newFileFields: any, existingFile: any);

	abstract notify(newFileFields: any, existingFile: any);
	
	abstract unlock(key: string);

	async invalidateCDN(file: any){
		const keyInvalidationPath = `/${this.getAbsolutePath(file.Key)}`; //Invalidation path must start with a '/'.
		const invalidationPaths: string[] = [];
		invalidationPaths.push(keyInvalidationPath);

		if(file.Thumbnails){
			file.Thumbnails.map(thumbnail => invalidationPaths.push(`/thumbnails${keyInvalidationPath}_${thumbnail.Size}`));
		}

		console.log(`Trying to invlidate ${invalidationPaths}...`);

		const { shouldSkipInvalidation, skipReason }: { shouldSkipInvalidation: boolean; skipReason: string; } = this.shouldSkipInvalidation(keyInvalidationPath, file); // If it used NoCache flag, there's no need to invalidate.

		if(shouldSkipInvalidation)
		{ 
			console.log(`Invalidation was not carried out since ${skipReason}`);
			return;
		}

		const cloudfront = new AWS.CloudFront({apiVersion: '2020-05-31'});
		const invalidationParams = {
			DistributionId: this.CloudfrontDistribution,
  			InvalidationBatch: {
				CallerReference: (new Date()).getTime().toString(), //A unique string to represent each invalidation request.
				Paths: { 
					Quantity: invalidationPaths.length, 
					Items: invalidationPaths
				}
  			}
		};

		const invlidation = await cloudfront.createInvalidation(invalidationParams).promise();

		console.log(`Invalidation result:\n ${JSON.stringify(invlidation)}...`);

		return invlidation;
	}

	private shouldSkipInvalidation(keyInvalidationPath: string, file: any) {
		const shouldSkipInvalidation: boolean = keyInvalidationPath.endsWith('/') || !file.doesFileExist || file.NoCache;

		let skipReason: string = '';

		if (keyInvalidationPath.endsWith('/'))
			skipReason = 'requested path is a folder.'; // If this is a folder or if this file doesn't exist, it has no CDN representation, and there's no need to invalidate it.
		else if (!file.doesFileExist)
			skipReason = 'the file does not exist.';
		else if (file.NoCache)
			skipReason = 'the file used no-cache.'; // If it used NoCache flag, there's no need to invalidate.

		return { shouldSkipInvalidation, skipReason };
	}

	async deleteS3FileVersion(Key: any, s3FileVersion: any) {
		console.log(`Trying to delete version: ${s3FileVersion} of key: ${Key}`);
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = this.getAbsolutePath(Key);
		params.VersionId = s3FileVersion;

		const deletedVersionRes = await this.s3.deleteObject(params).promise();
		console.log(`Successfully deleted version: ${s3FileVersion} of key: ${Key}`);

		return deletedVersionRes;
	}

	//#endregion

	//#region IPfsGetter
	async getObjectS3FileVersion(Key: any) {
		console.log(`Trying to retrieve the latest VersionId of key: ${Key}`);
		const params: any = {};
		let latestVersionId;

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Prefix = this.getAbsolutePath(Key);

		if(Key.endsWith("/")) // If this is a folder, it has no S3 representations, and so has no VersionId.
		{
			latestVersionId = undefined;

			console.log(`Requested key is a folder, and has no VersionId.`);
		}
		else
		{
			// Retrieve the list of versions.
			const allVersions = await this.s3.listObjectVersions(params).promise();

			// listObjectVersions GETs all file versions, in two arrays: 
			// 1. Versions, used for all available versions.
			// 2. DeleteMarkers, used to list versions where the file is marked as deleted.
			
			// Delete markers enable S3 to mark deleted files and behave accordingly (They won't be served, etc.),
			// while still keeping all previous versions' data.If we use this delete marker, our Latest Version
			// will not be listed in the first Versions array, but rather on the second DeleteMarkers array.

			// For more information about delete markers: https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeleteMarker.html
			// For more information about listObjectVersions: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectVersions-property

			const filteredVersionId = allVersions.Versions.filter(ver => ver.IsLatest) ?? allVersions.DeleteMarkers.filter(ver => ver.IsLatest);

			latestVersionId = filteredVersionId.length > 0 ? filteredVersionId[0].VersionId : undefined; // undefined will be returned in case no available version is found on S3.

			console.log(`Successfully retrieved the latest VersionId: ${latestVersionId} of key: ${Key}`);
		}

		return latestVersionId;
	} 
	
	//#endregion

	//#region private methods
	private async uploadFileData(file: any, isNoCache = NO_CACHE_DEFAULT_VALUE): Promise<any> 
	{
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = this.getAbsolutePath(file.Key);
		params.Body = file.buffer;
		params.ContentType = this.getMimeType();
		params.ContentEncoding = 'base64';
		if(isNoCache){
			params.CacheControl = 'no-cache';
		}

		// Upload to S3 bucket.
		const uploaded = await this.s3.upload(params).promise();
		console.log(`File uploaded successfully to ${uploaded.Location}`);

		return uploaded;
	}

	private async deleteFileData(removedKey: string): Promise<any> 
	{
		console.log(`Trying to delete Key: ${removedKey}`)
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = removedKey;
		
		// Delete from S3 bucket.
		const deletedFile = await this.s3.deleteObject(params).promise();
		console.log(`Successfully deleted Key ${removedKey}: ${JSON.stringify(deletedFile)}`);

		return deletedFile;
	}

	private async uploadThumbnail(Key: string, size: string, Body: Buffer, isNoCache = NO_CACHE_DEFAULT_VALUE): Promise<any> 
	{
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = `thumbnails/${this.getAbsolutePath(Key)}_${size}`;
		params.Body = Body;
		params.ContentType = this.getMimeType();
		params.ContentEncoding = 'base64';
		if(isNoCache){
			params.CacheControl = 'no-cache';
		}

		// Upload to S3 bucket.
		const uploaded = await this.s3.upload(params).promise();
		console.log(`File uploaded successfully to ${uploaded.Location}`);

		return uploaded;
	}

	private async deleteThumbnail(key: any, size: any) {
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = `thumbnails/${this.getAbsolutePath(key)}_${size}`;
		
		// delete thumbnail from S3 bucket.
		const deleted = await this.s3.deleteObject(params).promise();
		console.log(`Thumbnail successfully deleted:  ${deleted}`);

		return deleted;
	}

	private getMimeType(): any 
	{
		let MIME = this.request.body.MIME;
		if(this.request.body.URI && this.isDataURL(this.request.body.URI))
		{
			// Get mime type from base64 data
			MIME = this.request.body.URI.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
		}

		return MIME;
	}

	private isDataURL(s) 
	{
		return !!s.match(dataURLRegex);
	}

	private async generatePreSignedURL(file)
	{
		const entryName = this.getAbsolutePath(file.Key);

		const params =  {
			Bucket: S3Buckets[this.environment],
			Key: entryName,
			Expires: 24*60*60, //PUT presigned URL will expire after 24 hours = 60 sec * 60 min * 24 hrs
			ContentType: this.getMimeType()
		};
			
		const urlString = await this.s3.getSignedUrl('putObject',params);
		return urlString;
	}

	//#endregion
}