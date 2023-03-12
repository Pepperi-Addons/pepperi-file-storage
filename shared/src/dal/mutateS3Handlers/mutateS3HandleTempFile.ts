import { MutateS3HandleFileCopy } from "./mutateS3HandleFileCopy";

export class MutateS3HandleTempFile extends MutateS3HandleFileCopy
{
	protected override async specificHandle(): Promise<void> 
	{
		// Copy the file's data from the temp location to the final location.
		const absolutePath = this.s3PfsDal.getAbsolutePath(this.newFileFields.Key);
		const res = await this.s3PfsDal.awsDal.copyS3Object(this.s3PfsDal.request.body.TemporaryFileURLs, absolutePath, this.shouldUseCache);

		// Set the file version and size
		this.newFileFields.FileVersion = res.$response.data?.VersionId;
		this.newFileFields.FileSize = await this.s3PfsDal.awsDal.getFileSize(absolutePath);

		// Delete the TemporaryFileURLs
		delete this.newFileFields.TemporaryFileURLs;
	}
}
