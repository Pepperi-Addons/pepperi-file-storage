import { PapiClient } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import S3, { ListObjectsV2Request, Metadata } from 'aws-sdk/clients/s3';
import AWS from 'aws-sdk';
import jwtDecode from 'jwt-decode';

const BUCKET = 'pepperi-file-storage-dev';

class PfsService 
{
	papiClient: PapiClient
	s3: S3;
	DistributorUUID: string;
	AddonUUID: string;

	constructor(private client: Client, private request: Request) 
	{
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			addonSecretKey: client.AddonSecretKey,
			actionUUID: client.AddonUUID
		});

		const accessKeyId = "";
		const secretAccessKey = "";
		const sessionToken = "";
		AWS.config.update({
			accessKeyId,
			secretAccessKey,
			sessionToken
		});

		this.DistributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];
		this.AddonUUID = this.request.query.AddonUUID;
		this.s3 = new S3();
	}

	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. An absolute path is a path that includes the Distributor's UUID, 
	 * the Addon's UUID and the trailing requested path.
	 * @param relativePath the path relative to the addon's folder
	 * @returns a string in the format ${this.DistributorUUID}/${this.AddonUUID}/${relativePath}
	 */
	private getAbsolutePath(relativePath: string)
	{
		return `${this.DistributorUUID}/${this.AddonUUID}/${relativePath}`;
	}

	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. A relative path is a path that's relative to the addon's folder.
	 * @param absolutePath the original path the addon requested
	 * @returns a relative path string
	 */
	 private getRelativePath(absolutePath: string): string
	{
		return absolutePath.split(`${this.DistributorUUID}/${this.AddonUUID}/`)[1];
	}

	async uploadToAWS(): Promise<boolean> 
	{
		try 
		{

			const entryname = this.getAbsolutePath(this.request.body.filename);
			const metadata: Metadata = this.getMetada();

			const buf = Buffer.from(this.request.body.filebody.split(/base64,/)[1], 'base64');
			const params = {
				Bucket: BUCKET,
				Key: entryname,
				Metadata: metadata,
				Body: buf,
				ContentType: this.request.body.contentType,
				ContentEncoding: 'base64'
			};

			// Uploading files to the bucket (sync)
			const uploaded = await this.s3.upload(params).promise();

			console.log(`File uploaded successfully to ${uploaded.Location}`);
		}
		catch (err) 
		{
			if (err instanceof Error)
			{
				console.error(`Could not upload file ${this.request.body.filename} to S3. ${err.message}`);
				throw err;
			}
		}
		return false;
	}

	/**
	 * Returns a Metadata object rperesenting the needed metadata.
	 * @returns a dictionary representation of the metadata.
	 */
	protected getMetada(): Metadata 
	{
		const metadata: Metadata = {};

		metadata["Sync"] = this.request.body.Sync ? this.request.body.Sync : "None";

		if (this.request.body.Description) 
		{
			metadata["Description"] = this.request.body.Description;
		}

		return metadata;
	}

	async downloadFromAWS() 
	{
		try 
		{

			const entryname: string = this.getAbsolutePath(this.request.query.fileName);

			const params = {
				Bucket: BUCKET,
				Key: entryname,
			};

			const splitFileKey = this.request.query.fileName.split('/');

			// Downloading files from the bucket
			const downloaded: any = await this.s3.getObject(params).promise();

			const response = {
				Key: this.request.query.fileName,
				Name: splitFileKey.pop(), //The last part of the path is the object name
				Folder: splitFileKey.join('/'), // the rest of the path is its folder.
				URI: `data:@${downloaded.ContentType};base64,${downloaded.Body.toString('base64')}`,
				Sync: downloaded.Metadata.sync ? downloaded.Metadata.sync : "None",
				MIME: downloaded.ContentType,
				URL: "this is the cdn url...",
				...(downloaded.Metadata.description && { Description: downloaded.Metadata.description }),
			}

			console.log(`File Downloaded`);

			return response;
		}
		catch (err) 
		{
			if (err instanceof Error)
			{
				console.error(`${err.message}`);
				throw(err);
			}
		}
	}

	async listFiles() 
	{
		const response: any[] = [];
		try 
		{
			const params: ListObjectsV2Request = {
				Bucket: BUCKET,
				Prefix: this.getAbsolutePath(this.request.query.folder)
			};

			const objectList = await this.s3.listObjectsV2(params).promise();
			console.log(objectList);        
			console.log(`Files listing done successfully successfully.`);

			
			objectList.Contents?.forEach(object => 
			{
				const relativePath: string = this.getRelativePath(object.Key ? object.Key : "");
				const splitFileKey = relativePath.split('/');
				response.push({
					Key: relativePath,
					Name: splitFileKey.pop(), //The last part of the path is the object name
					Folder: splitFileKey.join('/'), // the rest of the path is its folder.
					URL: "this is the cdn url...",
				})
			});
		}
		catch (err) 
		{
			if (err instanceof Error)
			{
				console.error(`Could not list files in folder ${this.request.body.filename}. ${err.message}`);
				throw err;
			}
		}
	}
}

export default PfsService;
