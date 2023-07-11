import { MutateS3HandlePostBase } from "./mutateS3HandlePostBase";

export class MutateS3HandleFileUpload extends MutateS3HandlePostBase
{
	protected override async specificHandle(): Promise<void> 
	{
		const uploadRes = await this.uploadFileData();
		this.newFileFields.FileVersion = uploadRes.VersionId;
			
		delete this.newFileFields.buffer;
	}

	protected async uploadFileData(): Promise<any> 
	{
		const key = this.s3PfsDal.relativeAbsoluteKeyService.getAbsolutePath(this.newFileFields.Key);
		return this.s3PfsDal.uploadToS3(key, this.newFileFields.buffer, this.shouldUseCache);
	}
}
