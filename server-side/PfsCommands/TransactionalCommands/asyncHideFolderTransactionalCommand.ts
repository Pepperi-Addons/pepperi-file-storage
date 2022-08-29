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
}
