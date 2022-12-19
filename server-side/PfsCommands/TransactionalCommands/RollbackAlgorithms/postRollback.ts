import { TestError } from "pfs-shared";
import { BaseRollbackAlgorithm } from "./baseRollback";

export class PostRollbackAlgorithm extends BaseRollbackAlgorithm 
{
    async rollbackImplementation(): Promise<void>
    {
        this.rollbackLogger();

		await this.getCurrentItemData();
		console.log("Trying to determine where the transaction failed...");
		if(this.existingFile.doesFileExist && !this.areExistingAndLockedFileSame()) 
		// Changes have already been committed to (S3, if there were changes to the file's data and to) the metadata table. 
		// The transaction can be completed. Since there's no way of telling whether a notification has already been sent or not,
		// A notification will be sent anyway (PNS philosophy is "Notify at least once").
		{
			//Now the metadata table holds the updated data, and the lock table holds the outdated data.
			console.log("Changes have already been committed to the metadata table (and S3, if they were needed). The transaction can be completed. Notifying subscribers...");
			await this.pfsMutator.notify(this.existingFile, this.lockedFile);
		}
		else
		{
			console.log("No changes were committed to the metadata table. Checking if S3 has been updated...");
			const s3FileVersion = await this.pfsGetter.getObjectS3FileVersion(this.existingFile.Key);
			if (s3FileVersion != this.existingFile.FileVersion) //We have to get the file version from S3 since S3 has been updated, but the metadata table hasn't.
			// A change has been made to S3, but was not yet applied to ADAL. At this stage there's not enough data to complete
			// the transaction, so a rollback is needed. Permanently delete the newer S3 version, to revert the latest version to the previous one.
			{	
				console.log(`Changes have been committed to S3 (S3's VersionId = ${s3FileVersion}, metadata FileVersion = ${this.existingFile.FileVersion}). Reverting S3 to previous version (if exists. Otherwise delete S3 object.)`);
				await this.pfsMutator.deleteS3FileVersion(this.existingFile.Key, s3FileVersion);
				console.log("Done reverting S3 to previous state.");

			}	
			else
			{
				console.log("No changes have been committed to S3 either.");
			}
		} 

		console.log("Unlocking file...");
		await this.pfsMutator.unlock(this.lockedFile.Key);
		console.log("Done unlocking the file.");

		console.error(`Rollback algorithm has finished running for key: ${this.lockedFile.Key}`);

		if(this.request.query.testRollback) // If testing rollback, throw exception to stop the process after rollback.
		{
			throw new TestError("Testing rollback - finishing execution after rollback was done.");
		}
    }

    private areExistingAndLockedFileSame() 
	{
		console.log("Comparing locked object data and the stored metadata...");

		const files = [{...this.lockedFile}, {...this.existingFile}];

		for(const file of files)
		{
			delete file.ModificationDateTime
			delete file.CreationDateTime
			delete file.doesFileExist;
            delete file.TransactionType;
		}

		files[1].Key = files[1].Key.startsWith('/') ? files[1].Key.substring(1) : files[1].Key

		const res = shallowCompareObjects();

		console.log(`Comparison results - lockeFile === storedFile: ${res}`);

		return res;

		function shallowCompareObjects() 
		{
			return Object.keys(files[0]).length === Object.keys(files[1]).length &&
				Object.keys(files[0]).every(key => files[1].hasOwnProperty(key) && files[0][key] === files[1][key]
				);
		}
	}
}