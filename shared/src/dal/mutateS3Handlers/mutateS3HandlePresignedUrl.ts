import { MutateS3HandlePostBase } from "./mutateS3HandlePostBase";

export class MutateS3HandlePresignedUrl extends MutateS3HandlePostBase
{
	protected override async specificHandle(): Promise<any> 
	{
		const presignedUrlKey = this.s3PfsDal.getAbsolutePath(this.newFileFields.Key);
		const presignedUrlMimeType = this.s3PfsDal.getMimeType();
		this.newFileFields.PresignedURL = await this.s3PfsDal.generatePreSignedURL(presignedUrlKey, presignedUrlMimeType);
	}
}
