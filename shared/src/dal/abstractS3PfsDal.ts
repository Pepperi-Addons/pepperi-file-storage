import { Request } from '@pepperi-addons/debug-server';
import { CACHE_DEFAULT_VALUE, CdnServers, dataURLRegex, TempFile, TransactionType } from '../';
import { AbstractBasePfsDal } from './abstractBasePfsDal';
import { IAws } from './iAws';

export abstract class AbstractS3PfsDal extends AbstractBasePfsDal
{
    
	constructor(OAuthAccessToken: string, request: Request, maximalLockTime: number, private awsDal: IAws)
	{
		super(OAuthAccessToken, request, maximalLockTime);
	}

	//#region IPfsMutator
	public async mutateS3(newFileFields: any, existingFile: any){
		if(existingFile.isFileExpired){
			return await this.deleteFileData(existingFile.Key);
		}
		const isCache = this.shouldUseCache(newFileFields, existingFile);
		if(!this.request.body.URI && !existingFile.doesFileExist) // The file does not yet exist, and no data was provided. Assign a presigned URL for data upload.
		{ 
			const presignedUrlKey = this.getAbsolutePath(newFileFields.Key);
			const presignedUrlMimeType = this.getMimeType();
			newFileFields.PresignedURL = await this.generatePreSignedURL(presignedUrlKey, presignedUrlMimeType);
		}
		else if(newFileFields.IsTempFile)
		{
			// Copy the file's data from the temp location to the final location.
			const absolutePath = this.getAbsolutePath(newFileFields.Key);
			const res = await this.awsDal.copyS3Object(this.request.body.URI, absolutePath, isCache);
			newFileFields.FileVersion = res.$response.data?.VersionId;
			newFileFields.FileSize = await this.awsDal.getFileSize(absolutePath);
		}
		else if (this.request.body.URI) // The file already has data, or data was provided.
		{ 
			const uploadRes = await this.uploadFileData(newFileFields, isCache);
			newFileFields.FileVersion = uploadRes.VersionId;
			
			delete newFileFields.buffer;
		}

		delete newFileFields.IsTempFile

		if(Array.isArray(newFileFields.Thumbnails)){
            for (const thumbnail of newFileFields.Thumbnails) {
                await this.uploadThumbnail(newFileFields.Key, thumbnail.Size, thumbnail.buffer, isCache);
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

		// Hiding the file is done last, to provide a user who, for some reason,
		// decided to both update the file content and delete it in a single call
		// a consistent behavior.
		
		// In the future, when unhide will be developed, upon unhiding the file
		// the user will get their latest data.
		if(newFileFields.Hidden){
			await this.deleteFileData(newFileFields.Key);
			if (Array.isArray(existingFile.Thumbnails)) { //delete thumbnails from S3.
                for (const thumbnail of existingFile.Thumbnails) {
                    await this.deleteThumbnail(newFileFields.Key, thumbnail.Size);
                }
            }
		}
	}

	private shouldUseCache(newFileFields: any, existingFile: any) {
		let isCache = CACHE_DEFAULT_VALUE;

		if (newFileFields.hasOwnProperty('Cache')) {
			isCache = newFileFields.Cache;
		}
		else if (existingFile.hasOwnProperty('Cache')) {
			isCache = existingFile.Cache;
		}
		return isCache;
	}

	public async createTempFile(tempFileName: string, MIME: string): Promise<string>
	{
		const presignedUrl = await this.generatePreSignedURL(tempFileName, MIME);

		return presignedUrl;
	}

	abstract lock(item: any, transactionType: TransactionType);

	abstract mutateADAL(newFileFields: any, existingFile: any);

	abstract notify(newFileFields: any, existingFile: any);
	
	abstract unlock(key: string);

	async invalidateCDN(file: any){
		const keyInvalidationPath = `/${this.getAbsolutePath(file.Key)}`; //Invalidation path must start with a '/'.

		this.validateInvalidationRequest(keyInvalidationPath/*, file*/);

		// Collect all invalidation paths - The requested path, and its thumbnails
		const invalidationPaths: string[] = [];
		invalidationPaths.push(encodeURI(keyInvalidationPath));

		if(file.Thumbnails){
			file.Thumbnails.map(thumbnail => invalidationPaths.push(encodeURI(`/thumbnails${keyInvalidationPath}_${thumbnail.Size}`)));
		}

		console.log(`Trying to invalidate ${invalidationPaths}...`);

		const invalidation = await this.awsDal.cloudFrontInvalidate(invalidationPaths);;

		console.log(`Invalidation result:\n ${JSON.stringify(invalidation)}...`);

		return invalidation;
	}

	private validateInvalidationRequest(keyInvalidationPath: string/*, file: any*/) {
		let skipReason: string = '';

		if (keyInvalidationPath.endsWith('/'))
			skipReason = 'Requested path is a folder.'; // If this is a folder or if this file doesn't exist, it has no CDN representation, and there's no need to invalidate it.
		// else if (!file.Cache)
		// 	skipReason = "The file doesn't use cache."; // If Cache=false, there's no need to invalidate.

		if(skipReason){
			const errorMessage = `Invalidation request is invalid: ${skipReason}`;
			console.log(errorMessage);
			throw new Error(errorMessage);
		}
	}

	async deleteS3FileVersion(Key: any, s3FileVersion: any) {
		console.log(`Trying to delete version: ${s3FileVersion} of key: ${Key}`);

		const deletedVersionRes = await this.awsDal.s3DeleteObject(this.getAbsolutePath(Key));

		console.log(`Successfully deleted version: ${s3FileVersion} of key: ${Key}`);

		return deletedVersionRes;
	}

	async batchDeleteS3(keys: string[]) {
		// Only files can be deleted from S3, filter out any folder names
		keys = keys.filter(key => !key.endsWith('/'));
		
		// Call DeleteObjects
		const deleteObjectsRes = await this.deleteObjects(keys.map(key => this.getAbsolutePath(key)));
		
		// Delete all thumbnails for the deleted files
		await this.batchDeleteThumbnails(keys);

		for (const error of deleteObjectsRes.Errors) {
			console.error(`Delete objects encountered an error:${JSON.stringify(error)}`);
		}

		console.log(`Successfully deleted batch.`);

		return deleteObjectsRes;
	}

	//#endregion

	//#region IPfsGetter
	async getObjectS3FileVersion(Key: any) {
		console.log(`Trying to retrieve the latest VersionId of key: ${Key}`);
		const params: any = {};
		let latestVersionId;

		if(Key.endsWith("/")) // If this is a folder, it has no S3 representations, and so has no VersionId.
		{
			latestVersionId = undefined;

			console.log(`Requested key is a folder, and has no VersionId.`);
		}
		else
		{
			// Retrieve the list of versions.
			const allVersions = await this.awsDal.s3ListObjectVersions(this.getAbsolutePath(Key));

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
	private async uploadFileData(file: any, isCache = CACHE_DEFAULT_VALUE): Promise<any> 
	{
		const key = this.getAbsolutePath(file.Key);
		return this.uploadToS3(key, file.buffer, isCache);
	}

	private async uploadToS3(key, buffer, isCache = CACHE_DEFAULT_VALUE){
		const params: any = {};

		params.Key = key;
		params.Body = buffer;
		params.ContentType = this.getMimeType();
		if(!isCache){
			params.CacheControl = 'no-cache';
		}

		// Upload to S3 bucket.
		const uploaded = await this.awsDal.s3Upload(params);
		console.log(`File uploaded successfully to ${uploaded.Location}`);

		return uploaded;
	}

	private async deleteFileData(removedKey: string): Promise<any> 
	{
		console.log(`Trying to delete Key: ${removedKey}`);

		const keyToDelete = this.getAbsolutePath(removedKey);
		
		// Delete from S3 bucket.
		const deletedFile = await this.awsDal.s3DeleteObject(keyToDelete);
		console.log(`Successfully deleted Key ${removedKey}: ${JSON.stringify(deletedFile)}`);

		return deletedFile;
	}

	private async uploadThumbnail(Key: string, size: string, Body: Buffer, isCache = CACHE_DEFAULT_VALUE): Promise<any> 
	{
		const key = `thumbnails/${this.getAbsolutePath(Key)}_${size}`;
		return this.uploadToS3(key, Body, isCache);
	}

	private async deleteThumbnail(key: any, size: any) {

		const keyToDelete = `thumbnails/${this.getAbsolutePath(key)}_${size}`;
		
		// delete thumbnail from S3 bucket.
		const deleted = await this.awsDal.s3DeleteObject(keyToDelete);
		console.log(`Thumbnail successfully deleted:  ${deleted}`);

		return deleted;
	}

	private getMimeType(): string 
	{
		let MIME = this.request.body.MIME;
		if(this.request.body.URI && this.isDataURL(this.request.body.URI))
		{
			// Get mime type from base64 data
			MIME = this.request.body.URI.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
		}

		return MIME;
	}

	private isDataURL(s): boolean
	{
		return !!s.match(dataURLRegex);
	}

	private async generatePreSignedURL(key: string, contentType: string): Promise<string>
	{
		const params =  {
			Key: key,
			ContentType: contentType
		};
			
		const urlString = await this.awsDal.s3GetSignedUrl(params);
		return urlString;
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
		keys = keys.map(key => `thumbnails/${this.getAbsolutePath(key)}_200x200`);

		// Call DeleteObjects
		const deleteObjectsRes = await this.deleteObjects(keys);

		for (const error of deleteObjectsRes.Errors) {
			console.error(`Delete objects encountered an error:${JSON.stringify(error)}`);
		}

		console.log(`Successfully deleted batch.`);

		return deleteObjectsRes;
	}

	private async deleteObjects(absolutePaths: string[]) 
	{

		// For more information on S3's deleteObjects function see: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
		const deleteObjectsRes = await this.awsDal.s3DeleteObjects(absolutePaths)
		return deleteObjectsRes;
	}

	//#endregion
}