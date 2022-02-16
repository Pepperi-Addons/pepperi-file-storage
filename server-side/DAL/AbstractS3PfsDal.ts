import { Client, Request } from '@pepperi-addons/debug-server';
import { dataURLRegex, S3Buckets } from "../constants";
import { AbstractBasePfsDal } from './AbstartcBasePfsDal';

const AWS = require('aws-sdk'); // AWS is part of the lambda's environment. Importing it will result in it being rolled up redundently.

export abstract class AbstractS3PfsDal extends AbstractBasePfsDal
{
	private s3: any;
	private S3Bucket: any;
    
	constructor(client: Client, request: Request)
	{
		super(client, request);

		// const accessKeyId=""
		// const secretAccessKey=""
		// const sessionToken=""
		// AWS.config.update({
		// 	accessKeyId,
		// 	secretAccessKey,
		// 	sessionToken
		// });

		this.s3 = new AWS.S3();
		this.S3Bucket = S3Buckets[this.environment];
	}

	abstract listFolderContents(folderName: string): Promise<any>;

	abstract uploadFileMetadata(metadata: any, doesFileExist: boolean): Promise<any>;

	abstract downloadFileMetadata(Key: string): Promise<any>;

	public async deleteFileData(removedKey: string): Promise<any> 
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

	public async uploadFileData(Key: string, Body: Buffer): Promise<any> 
	{
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = this.getAbsolutePath(Key);
		params.Body = Body;
		params.ContentType = this.getMimeType();
		params.ContentEncoding = 'base64';

		// Upload to S3 bucket.
		const uploaded = await this.s3.upload(params).promise();
		console.log(`File uploaded successfully to ${uploaded.Location}`);

		return uploaded;
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

	async generatePreSignedURL(entryName)
	{
		entryName = this.getAbsolutePath(entryName);

		const params =  {
			Bucket: S3Buckets[this.environment],
			Key: entryName,
			Expires: 24*60*60, //PUT presigned URL will expire after 24 hours = 60 sec * 60 min * 24 hrs
			ContentType: this.getMimeType()
		};
			
		const urlString = await  this.s3.getSignedUrl('putObject',params);
		return urlString;
	}
}