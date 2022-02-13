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

		const accessKeyId="ASIA3SWCYKQBWVZCVPWT"
		const secretAccessKey="08SvctIfp79XNepmXfoTS8TqDZMXLo1LYssDSzVv"
		const sessionToken="IQoJb3JpZ2luX2VjEDAaDGV1LWNlbnRyYWwtMSJGMEQCIF8MaYH/nQIAmzm6jGmrjEO7B+GjXMC9QcfrDgqU4EkOAiBLO09EdpNzjxvh1Fme2kfq9fzXgJYduVeQ6FQyTs4ZlCqOAwh5EAEaDDc5NjA1MTEzMzQ0MyIM573LU6ZvaoW+TGS5KusC18+FQ/7O1wu8RNM4habngeboun2yPRrK92X0lC9u/NLD1zua9baRptQK1u8w9aSHbKa4iC+xF8GfuxofkUxUn9xsjVHySSAVQF00/MakqjvEpVq0mFszZwUImdXfXPSReYsxrIUwFjKBkuA2G0LMUauKQ5OBNMela8DVZ9EZJRRxVtoPT9UDmgJIojFtQDpLR/UOrS98rcWs9hVuwyVMoRzyWcTPMC9mpf1H6uz3ytp+dds/khJ8gy3vtUFaHricAiA9S2ZmzjU0Dn8DaMfevBnDDryL1K5PgC6vc/UwG4rme5UTSZtp/jv5LCLu61ckh1QnYeIHOsudYboGD8m6MHlir5gkM6igE0X+atlauXWxqe28mSvQVt7R0g+4rAQ5PkfPP/7cF3kIuCObBQ2L1qAUQMmxkQoOPdnbw6dIDuY4pY6oEDuQFH2ylSpQcfz1IJS2BArdsVTOxvxU6KFpo4gcdflkQHy+LnG7MJrQpJAGOqcBLPWB3OwZyE8N/sZmuOnylW2oU+9WIH1KASYRkEG/0uGCyt90tTI9vD9xhC+EQFk1rkN601TCDrdloEwNDO1LIqQWqHrKMJrln8nYvpBz+Ki5+E9U4MjQpx9HAf78BUgf20653vcRkZK63ip/zuSFAHMbkS3cYweV7x7GgalavefKA3RnJcni894x2meaK8QBfzTchaKpEnTG63XYd4s5hlAtx5S6nrk="
		AWS.config.update({
			accessKeyId,
			secretAccessKey,
			sessionToken
		});

		this.s3 = new AWS.S3();
		this.S3Bucket = S3Buckets[this.environment];
	}

	abstract listFolderContents(folderName: string): Promise<any>;

	abstract uploadFileMetadata(metadata: any, doesFileExist: boolean): Promise<any>;

	abstract downloadFileMetadata(Key: string): Promise<any>;

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

	public async uploadThumbnail(Key: string, size: string, Body: Buffer): Promise<any> 
	{
		const params: any = {};

		// Create S3 params
		params.Bucket = this.S3Bucket;
		params.Key = `thumbnails/${this.getAbsolutePath(Key)}_${size}`;
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