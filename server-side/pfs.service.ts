import { PapiClient, InstalledAddon } from '@pepperi-addons/papi-sdk'
import { Client, Request } from '@pepperi-addons/debug-server';
import S3, { ListObjectsV2Request, Metadata } from 'aws-sdk/clients/s3';
import AWS from 'aws-sdk';
import { ConfigurationServicePlaceholders } from 'aws-sdk/lib/config_service_placeholders';

const BUCKET = 'pepperi-storage-stage';


class PfsService 
{
	papiClient: PapiClient
	s3: S3;

	constructor(private client: Client) 
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

		this.s3 = new S3();
	}

	async uploadToAWS(request: Request): Promise<boolean> 
	{
		try 
		{

			const entryname = request.body.filename;
			const metadata: Metadata = this.getMetada(request);

			const buf = Buffer.from(request.body.filebody.split(/base64,/)[1], 'base64');
			const params = {
				Bucket: BUCKET,
				Key: entryname,
				Metadata: metadata,
				Body: buf,
				ContentType: request.body.contentType,
				ContentEncoding: 'base64'
			};

			// Uploading files to the bucket (sync)
			const uploaded = await this.s3.upload(params).promise();

			console.log(`File uploaded successfully to ${uploaded.Location}`);
		}
		catch (err) 
		{
			if (err instanceof Error)
				console.error(`Could not upload file ${request.body.filename} to S3. ${err.message}`);
		}
		return false;
	}

	/**
	 * Returns a Metadata object rperesenting the needed metadata.
	 * @param request 
	 * @returns a dictionary representation of the metadata.
	 */
	protected getMetada(request: Request): Metadata 
	{
		const metadata: Metadata = {};

		const splitFileKey = request.body.filename.split('/');

		metadata["Name"] = splitFileKey.pop();
		metadata["Folder"] = splitFileKey.join('/');

		metadata["Sync"] = request.body.Sync ? request.body.Sync : "None";

		if (request.body.Description) 
		{
			metadata["Description"] = request.body.Description;
		}

		return metadata;
	}

	async downloadFromAWS(request: Request) 
	{
		try 
		{

			const entryname: string = request.query.fileName;

			const params = {
				Bucket: BUCKET,
				Key: entryname,
			};

			// Downloading files from the bucket
			const uploaded = await this.s3.upload(params).promise();

			console.log(`File Downloaded file`);
			const downloaded = await this.s3.getObject(params).promise();
			console.log(downloaded);

			return downloaded;
		}
		catch (err) 
		{
			if (err instanceof Error)
				console.error(`${err.message}`);
		}
		return false;
	}

	async listFiles(request: Request) 
	{
		try 
		{
			const params: ListObjectsV2Request = {
				Bucket: BUCKET,
				Prefix: request.query.folder  // Can be your folder name
			};

			const objectList = await this.s3.listObjectsV2(params).promise();
			console.log(objectList);        
			console.log(`Files listing done successfully successfully.`);
		}
		catch (err) 
		{
			if (err instanceof Error)
				console.error(`Could not list files in folder ${request.body.filename}. ${err.message}`);
		}
		return false;
	}
}

export default PfsService;