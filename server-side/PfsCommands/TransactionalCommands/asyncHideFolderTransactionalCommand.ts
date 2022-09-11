import { DIMXObject, PapiClient } from '@pepperi-addons/papi-sdk';
import fetch from 'node-fetch';
import { TeamsWebhooks } from '../../constants';
import { batch } from '../../data-source-api';
import { Helper } from "../../helper";
import { ABaseHideFolderTransactionalCommand } from "./aBaseHideFolderTransactionalCommand";

export class AsyncHideFolderTransactionalCommand extends ABaseHideFolderTransactionalCommand
{

	public async preLockLogic()
	{
		// We don't check the secret key in the Async class to allow 
		// the transactions unlock job to clean stale transactions.
		await this.canonizeFolderKey();
	}

	public async lock(): Promise<void>
	{
		if(!this.request.query.forceRollback)
		{
			// We have to ensure there's a single active ExecutionUUID trying to delete the folder and it's subtree.
			await this.validateSingleTransactionExecution();

			// Since calling AsycHideFolder is always done under a 'hide' lock (validated
			// in validateSingleTransactionExecution()), there's no need to rollback or lock the existing lock.
		}
    }

	/**
	 * AsyncHideFolder as run only if there's already a lock in place, placed by the SyncHideFolder.
	 * Validate a 'hide' transaction is in place, and that there's no currently running ExecutionUUID on it.
	 */
	 private async validateSingleTransactionExecution()
	 {
		console.log('AsyncHideFolder: validating a single transaction execution...');
		const lockedFile = await this.pfsMutator.isObjectLocked(this.request.body.Key);
 
		if(!(lockedFile?.TransactionType === this.TRANSACTION_TYPE))
		{
			const errorMessage = `AsyncHideFolder must be called when there's a 'hide' lock on the Key. No such lock found for key ${this.request.body.Key}`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
		 
		if(lockedFile.ExecutionUUID)
		{
			if(lockedFile.ExecutionUUID === this.client.ActionUUID)
			{
				console.log(`AsyncHideFolder: The lock is owned by this ExecutionUUID.`);
				// The current ExecutionUUID has the lock, we can successfully return from this function.
				return;
			}
			else // There's another ExecutionUUID that has the lock.
			{
				// if other action is still running, throw error (ID == 2 means inProgress)
				if (await this.isAuditLogInProgress(lockedFile.ExecutionUUID))
				{
					throw new Error(`A different Hide operation is still in progress: ${lockedFile.ExecutionUUID}`);
				}
				console.log(`AsyncHideFolder: The lock is owned by an ExecutionUUID that is stale.`);
			}
		}
		
		console.log(`AsyncHideFolder: Setting the current ExecutionUUID on the lock...`);

		// The ExecutionUUID has expired, or does not exist.
		// Set a new lock with the request's actionUUID
		lockedFile.ExecutionUUID = this.client.ActionUUID;
		await this.pfsMutator.setRollbackData(lockedFile);
 
		// call to the same method, which will either return (locking succeeded) or throw an error (another action locked the item)
		// This is to ensure a our lock is the single one, minimizing the risk of a race condition but not entirely eliminating it.
		// We need a pessimistic lock for that, which is not currently implemented.
		console.log(`AsyncHideFolder: Current ExecutionUUID was set on the lock. Validating it was not overwritten...`);

		await this.validateSingleTransactionExecution();
 
	}

	/**
	 * Returns true if the audit log status is InProgress. Returns false otherwise.
	 * @param executionUUID the executionUUID to check
	 */
	private async isAuditLogInProgress(executionUUID: string)
	{
		let auditLog = await Helper.getAuditLog(executionUUID, this.client);
		// ID == 2 means inProgress
		return auditLog?.Status?.ID == 2
	}

    async executeTransaction(): Promise<any>
	{	
		// First, hide the requested folder, to prevent it from being visible in the UI.
		// This should have been done in the sync call, but we do it again here in case the async call was done directly.
		// (Like when the transaction unlock job calls)
		await this.hideRequestedFolder();
		// Then, delete all files and folders inside the requested folder.
		// It should be possible to hide the files and folder concurrently, but for simplicity and readability, we'll do it sequentially.
		await this.hideSubtreeFiles();
		await this.hideSubtreeFolders();
    }

	private async hideSubtreeFiles()
	{
		console.log(`Hide Folder: Hiding files in the subtree...`);
		let filesKeys: any[] = [];

		do {
			// Get the subtree's files' keys
			// Since each page's files are deleted, there's no use in requesting different pages.
			filesKeys = await this.getSubtreeFilesKeys();

			// Hide the files using pfs batch operation.
			// We use this since it updates the UploadedBy field and actually deletes the file from S3, including thumbnails.
			await this.hideObjectsUsingPfsBatchDisregardingExistingLocks(filesKeys);
		}
		while (filesKeys.length > 0);

		console.log(`Hide Folder: Done hiding the subtree's files.`);
	}

	private async hideObjectsUsingPfsBatchDisregardingExistingLocks(filesKeys: any) {
		const lowerCaseHeaders = Helper.getLowerCaseHeaders(this.request.header);
		const papiClient: PapiClient = Helper.createPapiClient(this.client, this.AddonUUID, lowerCaseHeaders["x-pepperi-secretkey"]);

		filesKeys = filesKeys.map(fileKey => {
			return {
				Key: fileKey,
				DeletedBy: this.request.body.Key,
				Hidden: true,
			};
		});

		// Unlock any locked objects before hiding them
		await Promise.allSettled(filesKeys.map(fileKey => (async () => 
		{
			await this.pfsMutator.unlock(fileKey);
		})()));

		// Hiding files involves S3 operations for deleting the files and their thumbnails.
		// Since AsyncHideFolder is designed to be called in async, it will run in an async lambda,
		// which does not have permissions to access S3. We have to call a Sync endpoint to
		// hide the files, which will run on PFS lambda.
		// The obvious way to handle this is calling a DIMX import, but since DIMX is dependent on PFS,
		// we cannot depend on DIMX.

		// Thus, we have to mimic the DIMX import call to the Batch endpoint.

		const body = {
			Objects: filesKeys,
			AddonUUID: this.AddonUUID,
			Resource: this.request.query.resource_name
		}

		const res: {"DIMXObjects": DIMXObject[]} = await papiClient.post(`/addons/api/${this.client.AddonUUID}/data-source-api/batch`, body);

		// // Locally call Batch for debug:
		// const requestCopy = {... this.request};
		// requestCopy.body = body;
		// const res: {"DIMXObjects": DIMXObject[]} = await (batch(this.client, requestCopy));

		res.DIMXObjects.filter(obj => obj.Status === "Error").map(obj => console.error(`Failed to Hide Key '${obj.Key}': ${obj.Details}`));

	}

	private async getSubtreeFilesKeys()
	{
		const whereClause = 'MIME != "pepperi/folder"';
		return await this.getObjectsKeysFromSubtree(whereClause);
	}


	public async rollback(force?: boolean | undefined): Promise<void>
	{
		// Rolling back the AsyncHideFolder results in calling the same AsyncHideFolder.
		// To avoid an infinite loop, keep this function implementation empty.
		// In any case, whether AsyncHideFolder was called from SyncHideFolder, from Rollback or from the
		// Transactions Unlock Job, the AsyncHideFolder is called with 3 retries, so 
		// there will be further chances to complete the transaction.

		// If it still fails after 3 retries, something is probably wrong.

		// Report issue on Teams
		await this.reportHideFoldersFailureOnTeams()
	}

	private async reportHideFoldersFailureOnTeams()
	{
		
		const message = `ActionUUID: ${this.client.ActionUUID}, DistributorUUID: ${this.DistributorUUID}, AddonUUID: ${this.AddonUUID}, Schema name: ${this.request.query.resource_name}. Failed to hide folder '${this.request.body.Key}'.`

		const body = {
			themeColor: 'FF0000', // Red color, for failure.
			Summary: `PFS - DistributorUUID: ${this.DistributorUUID}, failure to hide folder`,
			sections: [{
				'facts': [{
					name: 'DistributorUUID',
					value: this.DistributorUUID,
				}, {
					name: 'Message',
					value: message,
				}],
				'markdown': true,
			}],
		};

		const url = TeamsWebhooks[this.environment];

		await fetch(url, {
			method: 'POST',
			body: JSON.stringify(body),
		});
	}

	async unlock(key: string): Promise<void>{
        await this.pfsMutator.unlock(key);
    }
}
