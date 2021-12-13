import { PapiClient, InstalledAddon } from '@pepperi-addons/papi-sdk'
import { Client } from '@pepperi-addons/debug-server';
import S3 from 'aws-sdk/clients/s3';
import AWS from 'aws-sdk';
import { ConfigurationServicePlaceholders } from 'aws-sdk/lib/config_service_placeholders';

class PfsService 
{
	papiClient: PapiClient

	constructor(private client: Client) 
	{
		this.papiClient = new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: client.AddonUUID,
			addonSecretKey: client.AddonSecretKey,
			actionUUID: client.AddonUUID
		});
	}

	async uploadToAWS(filename: string, filebody: string, contentType: string): Promise<boolean> {
        try {
			
			const accessKeyId = "";
				const secretAccessKey = "";
				const sessionToken = "";				
			 	AWS.config.update({
						accessKeyId,
						secretAccessKey,
						sessionToken
					}
				);

            let s3 = new S3();            

            const bucket = 'pepperi-storage-stage';
            const entryname = '1110703/Attachments/' + filename;

            let buf = Buffer.from(filebody.split(/base64,/)[1], 'base64');
            let params = {
                Bucket: bucket, 
                Key: entryname, 
                Body: buf, 
                // ACL: "public-read",
                ContentType: contentType,
                ContentEncoding: 'base64'
            };

            // Uploading files to the bucket (async)
            // s3.upload(params, function(err, data) {
            //     if (err) {
            //         console.error(err.message);
            //     }
            //     console.log(`File uploaded successfully. ${data.Location}`);
            // });

            // Uploading files to the bucket (sync)
            const uploaded = await s3.upload(params).promise();

            console.log(`File uploaded successfully to ${uploaded.Location}`);
        }
        catch (err)
        {
            if (err instanceof Error)
                console.error(`Could not upload file ${filename} to S3. ${err.message}`);
        }
        return false;
    }

	async downloadFromAWS(filename: string){
        try {

			// Use this for temporary credentials (do not commit):
				const accessKeyId = "";
				const secretAccessKey = "";
				const sessionToken = "";
				AWS.config.update({
						accessKeyId,
						secretAccessKey,
						sessionToken
					}
				);
            let s3 = new S3();            

            const bucket = 'pepperi-storage-stage';
            const entryname = '1110703/Attachments/85960bd01d8d448b950a4820855fdef8.jpg';

            let params = {
                Bucket: bucket, 
                Key: entryname, 
                // Body: buf, 
                // ACL: "public-read",
                // ContentType: contentType,
                // ContentEncoding: 'base64'
            };

            // Uploading files to the bucket (async)
            // s3.upload(params, function(err, data) {
            //     if (err) {
            //         console.error(err.message);
            //     }
            //     console.log(`File uploaded successfully. ${data.Location}`);
            // });

            // Uploading files to the bucket (sync)
            s3.getObject(params, (err, data) => {
				if (err) console.error(err);
				console.log(`${JSON.stringify(data)}`);
			  });
        }
        catch (err)
        {
            if (err instanceof Error)
                console.error(`${err.message}`);
        }
        return false;
    }



}

export default PfsService;