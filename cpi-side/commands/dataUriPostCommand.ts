import { FileToUpload, ICommand, RelativeAbsoluteKeyService } from "pfs-shared";
import { FileUploadService } from "../fileUpload.service";
import jwtDecode from "jwt-decode";
import { v4 as uuid } from "uuid";
import { TemporaryFileUrlPostCommand } from "./temporaryFileUrlPostCommand";


export class DataUriPostCommand extends TemporaryFileUrlPostCommand implements ICommand
{
	protected readonly MINIMAL_CPI_VERSION = "17.2";
	
	public override async execute(): Promise<any> 
	{
		debugger;
		// Validate that the CPI version is higher than this.MINIMAL_CPI_VERSION
		await this.validateCpiNodeVersion();

		// Write file data to device's storage and ADAL metadata table
		const res: any = await super.execute();

		await this.uploadToTempFile(res);

		return res;
	}

	/**
	 * Validate that the CPI version is higher than this.MINIMAL_CPI_VERSION
	 * @throws Error if the version is lower than this.MINIMAL_CPI_VERSION
	 * @returns {Promise<void>}
	 */
	protected async validateCpiNodeVersion(): Promise<void>
	{
		// software version is in the format of "x.y". Split by '.', take the first number and parse it to int.
		// From the second number, take the first digit and parse it to int.
		const minimalMajorVersion = parseInt(this.MINIMAL_CPI_VERSION.split(".")[0]);
		const minimalMinorVersion = parseInt(this.MINIMAL_CPI_VERSION.split(".")[1][0]);

		const actualSoftwareVersion = (await pepperi.environment.info()).softwareVersion;
		const majorVersion = parseInt(actualSoftwareVersion.split(".")[0]);
		const minorVersion = parseInt(actualSoftwareVersion.split(".")[1][0]);

		// Throw an exception if the version is lower than this.MINIMAL_CPI_VERSION
		if(majorVersion < minimalMajorVersion || (majorVersion === minimalMajorVersion && minorVersion < minimalMinorVersion))
		{
			const errorMessage = `Offline POST with data URI is not supported in this version of CPI. Please upgrade to version ${this.MINIMAL_CPI_VERSION} or higher.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
	}

	protected async uploadToTempFile(res: any): Promise<void>
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

	protected async getRelativeAbsoluteKeyService(): Promise<RelativeAbsoluteKeyService>
	{
		const distUUID = jwtDecode(await pepperi.auth.getAccessToken())["pepperi.distributoruuid"];
		return new RelativeAbsoluteKeyService(distUUID, this.AddonUUID, this.request.query.resource_name);
	}
}
