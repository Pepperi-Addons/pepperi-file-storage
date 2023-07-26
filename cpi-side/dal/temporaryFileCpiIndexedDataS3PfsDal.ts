import { AddonData } from "@pepperi-addons/papi-sdk";
import { CpiIndexedDataS3PfsDal } from "./cpiIndexedDataS3PfsDal";


export class TemporaryFileCpiIndexedDataS3PfsDal extends CpiIndexedDataS3PfsDal 
{    
	protected override async setUrls(newFileFields: any, existingFile: any): Promise<void>
	{
		// If it's a file - set URL to to point to the TemporaryFileURLs[0],
		// and add a version, so that the cached file won't be served in case
		// it is upserted again.

		if(!newFileFields.Key.endsWith("/"))
		{
			const now = (new Date()).toISOString();
			newFileFields.URL = `${newFileFields.TemporaryFileURLs[0]}?v=${now}`;
		}
	}

	public override async mutateS3(newFileFields: any, existingFile: any): Promise<void> 
	{
		// Since the file was already uploaded to S3 as a temporary file,
		// there's no need to do anything s3-related in this class.

		return;
	}

	protected override async uploadFileMetadata(newFileFields: any, existingFile: any): Promise<AddonData> 
	{
		// Save the file to the PFS table.
		const superRes = await super.uploadFileMetadata(newFileFields, existingFile);

		delete superRes.TemporaryFileURLs; 

		return superRes;
	}
}
