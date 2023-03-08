import { CACHE_DEFAULT_VALUE } from '../../constants';
import { AbstractS3PfsDal } from '../abstractS3PfsDal';


export abstract class AMutateS3Handler// extends AbstractS3PfsDal
{
	protected shouldUseCache: boolean;

	constructor(
        protected newFileFields: any,
        protected existingFile: any,
        protected s3PfsDal: AbstractS3PfsDal,
        )
    {
		this.shouldUseCache = newFileFields?.Cache ?? existingFile?.Cache ?? CACHE_DEFAULT_VALUE;
    }

	abstract execute(): Promise<any>;

    protected async deleteFileData(removedKey: string): Promise<any> 
	{
		console.log(`Trying to delete Key: ${removedKey}`);

		const keyToDelete = this.s3PfsDal.relativeAbsoluteKeyService.getAbsolutePath(removedKey);
		
		// Delete from S3 bucket.
		const deletedFile = await this.s3PfsDal.awsDal.s3DeleteObject(keyToDelete);
		console.log(`Successfully deleted Key ${removedKey}: ${JSON.stringify(deletedFile)}`);

		return deletedFile;
	}
}
