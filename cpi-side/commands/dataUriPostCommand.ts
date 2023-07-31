import { FileToUpload, ICommand, RelativeAbsoluteKeyService } from "pfs-shared";
import { FileUploadService } from "../fileUpload.service";
import jwtDecode from "jwt-decode";
import { v4 as uuid } from "uuid";
import { TemporaryFileUrlPostCommand } from "./temporaryFileUrlPostCommand";


export class DataUriPostCommand extends TemporaryFileUrlPostCommand implements ICommand
{
	public override async execute(): Promise<any> 
	{
		// Write file data to device's storage and ADAL metadata table
		const res: any = await super.execute();

		await this.uploadToTempFile(res);

		return res;
	}

	private async uploadToTempFile(res: any): Promise<void>
	{
		const relativeAbsoluteKeyService = await this.getRelativeAbsoluteKeyService();
		// Save the file to the FilesToUpload table
		const fileToUpload: FileToUpload = {
			Key: uuid(),
			AbsolutePath: relativeAbsoluteKeyService.getAbsolutePath(res.Key!),
		};

		await this.filesToUploadDal.upsert(fileToUpload);

		const isLatestEntry = (await this.filesToUploadDal.getLatestEntryKey(fileToUpload)) === fileToUpload.Key;
		if(isLatestEntry)
		{
			// Upload file to temp file
			const fileUploadService = new FileUploadService(this.pepperiDal, pepperi.papiClient, fileToUpload);
			await fileUploadService.asyncUploadFile();
		}
		else
		{
			console.log(`A newer version of file ${fileToUpload.AbsolutePath} was already uploaded to temp file. Skipping upload.`);
			fileToUpload.Hidden = true;
			this.filesToUploadDal.upsert(fileToUpload);
		}
	}

	private async getRelativeAbsoluteKeyService(): Promise<RelativeAbsoluteKeyService>
	{
		const distUUID = jwtDecode(await pepperi.auth.getAccessToken())["pepperi.distributoruuid"];
		return new RelativeAbsoluteKeyService(distUUID, this.AddonUUID, this.request.query.resource_name);
	}
}
