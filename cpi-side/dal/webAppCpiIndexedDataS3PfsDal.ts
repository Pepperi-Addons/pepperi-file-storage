import { AddonData } from "@pepperi-addons/papi-sdk";
import { PfsService } from "../cpiPfs.service";
import { MobileCpiIndexedDataS3PfsDal } from "./mobileCpiIndexedDataS3PfsDal";


export class WebAppCpiIndexedDataS3PfsDal extends MobileCpiIndexedDataS3PfsDal 
{				

	public override async mutateS3(newFileFields: any, existingFile: any): Promise<void> 
	{
		// Since the file was already uploaded to S3 as a temporary file,
		// there's no need to do anything s3-related in this class.

		return;
	}

	protected override async getCpiURL(newFileFields: any): Promise<string>
	{
		return newFileFields.TemporaryFileURLs[0];
	}

	/**
	 * Updates the objects' URL if they have a cached URL.
	 * @param objects 
	 */
	protected override setObjectsUrls(objects: AddonData[])
	{
		objects.map(object => 
		{
			if(!PfsService.downloadedFileKeysToLocalUrl.has(`${object.Key!}${object.ModificationDateTime!}`))
			{
				const hasTemporaryFileURL = object.TemporaryFileURLs && object.TemporaryFileURLs.length > 0;
				// If this file has been POSTed, it would have a TemporaryFileURLs field.
				// If not, it would have a valid URL field.
				const cpiURL = `${hasTemporaryFileURL ? object.TemporaryFileURLs[0] : object.URL}?v=${object.ModificationDateTime!}`;
			
				PfsService.downloadedFileKeysToLocalUrl.set(`${object.Key!}${object.ModificationDateTime!}`, cpiURL);
			}
		
			object.URL = PfsService.downloadedFileKeysToLocalUrl.get(`${object.Key!}${object.ModificationDateTime!}`);
		});
	}
}
