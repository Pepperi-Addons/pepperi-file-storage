import { Request } from '@pepperi-addons/debug-server';
import { String } from 'aws-sdk/clients/cloudhsm';
import { CACHE_DEFAULT_VALUE, dataURLRegex, TransactionType } from '../';
import TempFileService from '../tempFileService';
import { AbstractBasePfsDal } from './abstractBasePfsDal';
import { IAws } from './iAws';
import { MutateS3HandlerFactory, MutateS3HandleType } from './mutateS3Handlers/mutateS3HandlerFactory';

export abstract class AbstractS3PfsDal extends AbstractBasePfsDal
{
    
	constructor(OAuthAccessToken: string, request: Request, maximalLockTime: number, public awsDal: IAws)
	{
		super(OAuthAccessToken, request, maximalLockTime);
	}
	
	//#region IPfsMutator
	public async mutateS3(newFileFields: any, existingFile: any)
	{
		let mutateS3HandlerType: MutateS3HandleType = "";
		if(existingFile.isFileExpired)
		{
			mutateS3HandlerType = "expiredFile";
		}
		else if(!this.request.body.URI && !existingFile.doesFileExist && !this.request.body.TemporaryFileURLs) // The file does not yet exist, and no data was provided. Assign a presigned URL for data upload.
		{ 
			mutateS3HandlerType = 'presignedUrl';
		}
		else if(Array.isArray(this.request.body.TemporaryFileURLs) && this.request.body.TemporaryFileURLs.length > 0)
		{
			if(this.request.body.TemporaryFileURLs.length === 1)
			{
				mutateS3HandlerType = 'tempFile';
			}
			else
			{
				mutateS3HandlerType = 'multipartUpload';
			}
		}
		else if (this.request.body.URI) // The file already has data, or data was provided.
		{ 
			mutateS3HandlerType = 'fileUpload';
		}

		const mutateS3Handler = MutateS3HandlerFactory.getHandler(mutateS3HandlerType, newFileFields, existingFile, this);
		await mutateS3Handler.execute();
	}

	public async createTempFile(tempFileName: string): Promise<string>
	{
		const presignedUrl = await this.generatePreSignedURL(tempFileName);

		return presignedUrl;
	}

	abstract override lock(item: any, transactionType: TransactionType);

	abstract override mutateADAL(newFileFields: any, existingFile: any);

	abstract override notify(newFileFields: any, existingFile: any);
	
	abstract override unlock(key: string);

	async invalidateCDN(file: any)
	{
		const keyInvalidationPath = `/${this.relativeAbsoluteKeyService.getAbsolutePath(file.Key)}`; //Invalidation path must start with a '/'.

		this.validateInvalidationRequest(keyInvalidationPath);

		// Collect all invalidation paths - The requested path, and its thumbnails
		const invalidationPaths: string[] = [];
		invalidationPaths.push(encodeURI(keyInvalidationPath));

		if(file.Thumbnails)
		{
			file.Thumbnails.map(thumbnail => invalidationPaths.push(encodeURI(`/thumbnails${keyInvalidationPath}_${thumbnail.Size}`)));
		}

		console.log(`Trying to invalidate ${invalidationPaths}...`);

		const invalidation = await this.awsDal.cloudFrontInvalidate(invalidationPaths);

		console.log(`Invalidation result:\n ${JSON.stringify(invalidation)}...`);

		return invalidation;
	}

	private validateInvalidationRequest(keyInvalidationPath: string) 
	{
		let skipReason = '';

		if (keyInvalidationPath.endsWith('/'))
			skipReason = 'Requested path is a folder.'; // If this is a folder or if this file doesn't exist, it has no CDN representation, and there's no need to invalidate it.

		if(skipReason)
		{
			const errorMessage = `Invalidation request is invalid: ${skipReason}`;
			console.log(errorMessage);
			throw new Error(errorMessage);
		}
	}

	async deleteS3FileVersion(Key: any, s3FileVersion: any) 
	{
		console.log(`Trying to delete version: ${s3FileVersion} of key: ${Key}`);

		const deletedVersionRes = await this.awsDal.s3DeleteObject(this.relativeAbsoluteKeyService.getAbsolutePath(Key));

		console.log(`Successfully deleted version: ${s3FileVersion} of key: ${Key}`);

		return deletedVersionRes;
	}

	async batchDeleteS3(keys: string[]) 
	{
		// Only files can be deleted from S3, filter out any folder names
		keys = keys.filter(key => !key.endsWith('/'));
		
		// Call DeleteObjects
		const deleteObjectsRes = await this.deleteObjects(keys.map(key => this.relativeAbsoluteKeyService.getAbsolutePath(key)));
		
		// Delete all thumbnails for the deleted files
		await this.batchDeleteThumbnails(keys);

		for (const error of deleteObjectsRes.Errors) 
		{
			console.error(`Delete objects encountered an error:${JSON.stringify(error)}`);
		}

		console.log(`Successfully deleted batch.`);

		return deleteObjectsRes;
	}

	//#endregion

	//#region IPfsGetter
	async getObjectS3FileVersion(Key: any) 
	{
		console.log(`Trying to retrieve the latest VersionId of key: ${Key}`);
		let latestVersionId;

		if(Key.endsWith("/")) // If this is a folder, it has no S3 representations, and so has no VersionId.
		{
			latestVersionId = undefined;

			console.log(`Requested key is a folder, and has no VersionId.`);
		}
		else
		{
			// Retrieve the list of versions.
			const allVersions = await this.awsDal.s3ListObjectVersions(this.relativeAbsoluteKeyService.getAbsolutePath(Key));

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

	//#region public methods
	public async uploadToS3(key, buffer, isCache = CACHE_DEFAULT_VALUE)
	{
		const params: any = {};

		params.Key = key;
		params.Body = buffer;
		params.ContentType = this.getMimeType();
		if(!isCache)
		{
			params.CacheControl = 'no-cache';
		}

		// Upload to S3 bucket.
		const uploaded = await this.awsDal.s3Upload(params);
		console.log(`File uploaded successfully to ${uploaded.Location}`);

		return uploaded;
	}

	public getMimeType(): string 
	{
		let MIME = this.request.body.MIME;
		if(this.request.body.URI && this.isDataURL(this.request.body.URI))
		{
			// Get mime type from base64 data
			MIME = this.request.body.URI.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
		}

		return MIME;
	}

	public async generatePreSignedURL(key: string, contentType?: string): Promise<string>
	{
		const params =  {
			Key: key,
			...(contentType && { ContentType: contentType })
		};
			
		const urlString = await this.awsDal.s3GetSignedUrl(params);
		return urlString;
	}

	//#endregion

	//#region private methods

	private isDataURL(s): boolean
	{
		return !!s.match(dataURLRegex);
	}

	private async batchDeleteThumbnails(keys: string[])
	{
		// This implementation issues a delete request for 200x200 thumbnails whether or not they exist.
		// A more complete implementation would list each file's existing thumbnails in S3, and only delete those that exist.
		// Since this is quite expensive to do, and since we currently we only have 200x200 thumbnails, we have decided to
		// go for a naive approach.

		// Only files can be deleted from S3, filter out any folder names
		keys = keys.filter(key => !key.endsWith('/'));

		// Create a list of thumbnails to delete
		keys = keys.map(key => `thumbnails/${this.relativeAbsoluteKeyService.getAbsolutePath(key)}_200x200`);

		// Call DeleteObjects
		const deleteObjectsRes = await this.deleteObjects(keys);

		for (const error of deleteObjectsRes.Errors) 
		{
			console.error(`Delete objects encountered an error:${JSON.stringify(error)}`);
		}

		console.log(`Successfully deleted batch.`);

		return deleteObjectsRes;
	}

	private async deleteObjects(absolutePaths: string[]) 
	{

		// For more information on S3's deleteObjects function see: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
		const deleteObjectsRes = await this.awsDal.s3DeleteObjects(absolutePaths);
		return deleteObjectsRes;
	}

	//#endregion
}
