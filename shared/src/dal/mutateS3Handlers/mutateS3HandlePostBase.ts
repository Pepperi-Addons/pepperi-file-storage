import { AMutateS3Handler } from "./aMutateS3Handler";

export class MutateS3HandlePostBase extends AMutateS3Handler
{
    public async execute(): Promise<void>
	{
		await this.specificHandle();
		await this.handleThumbnails();
		// Hiding the file is done last, to provide a user who, for some reason,
		// decided to both update the file content and delete it in a single call
		// a consistent behavior.
		
		// In the future, when unhide will be developed, upon unhiding the file
		// the user will get their latest data.
		await this.handleDeletion();
	}

	protected async specificHandle(): Promise<void>
	{
		Promise.resolve();
	}

	protected async handleThumbnails()
    {
        if(Array.isArray(this.newFileFields.Thumbnails))
		{
			for (const thumbnail of this.newFileFields.Thumbnails) 
			{
				await this.uploadThumbnail(thumbnail.Size, thumbnail.buffer,);
				delete thumbnail.buffer;
			}
			if (Array.isArray(this.existingFile.Thumbnails)) 
			{ //delete unnecessary thumbnails from S3.
				const deletedThumbnails = this.existingFile.Thumbnails.filter(existingThumbnail => 
				{
					return !this.newFileFields.Thumbnails.find(newThumbnail => 
					{
						return existingThumbnail.Size == newThumbnail.Size;
					});
				});
				for (const thumbnail of deletedThumbnails) 
				{
					await this.deleteThumbnail(thumbnail.Size);
				}
			}
		}
    }

    protected async uploadThumbnail(size: string, Body: Buffer): Promise<any> 
	{
		const key = `thumbnails/${this.s3PfsDal.relativeAbsoluteKeyService.getAbsolutePath(this.newFileFields.Key)}_${size}`;
		return this.s3PfsDal.uploadToS3(key, Body, this.shouldUseCache);
	}

	private async deleteThumbnail(size: any) 
	{

		const keyToDelete = `thumbnails/${this.s3PfsDal.relativeAbsoluteKeyService.getAbsolutePath(this.newFileFields.Key)}_${size}`;
		
		// delete thumbnail from S3 bucket.
		const deleted = await this.s3PfsDal.awsDal.s3DeleteObject(keyToDelete);
		console.log(`Thumbnail successfully deleted:  ${deleted}`);

		return deleted;
	}

	protected async handleDeletion() 
	{
		if(this.newFileFields.Hidden)
		{
			await this.deleteFileData(this.newFileFields.Key);
			if (Array.isArray(this.existingFile.Thumbnails)) 
			{ //delete thumbnails from S3.
				for (const thumbnail of this.existingFile.Thumbnails) 
				{
					await this.deleteThumbnail(thumbnail.Size);
				}
			}
		}
	}
}
