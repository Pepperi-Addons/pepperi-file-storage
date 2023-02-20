import { AMutateS3HandlePostBase } from "./aMutateS3HandlePostBase";

export class MutateS3HandleTempFile extends AMutateS3HandlePostBase
{
	protected async specificHandle(): Promise<any> 
	{
		// Copy the file's data from the temp location to the final location.
		const absolutePath = this.s3PfsDal.getAbsolutePath(this.newFileFields.Key);
		const res = await this.s3PfsDal.awsDal.copyS3Object(this.s3PfsDal.request.body.URI, absolutePath, this.shouldUseCache);
		this.newFileFields.FileVersion = res.$response.data?.VersionId;
		this.newFileFields.FileSize = await this.s3PfsDal.awsDal.getFileSize(absolutePath);
	}
}
