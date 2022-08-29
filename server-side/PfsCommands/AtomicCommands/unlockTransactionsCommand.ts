import { AddonData, FindOptions } from '@pepperi-addons/papi-sdk';
import { MAXIMAL_LOCK_TIME } from '../../constants';
import { IndexedDataS3PfsDal } from '../../DAL/IndexedDataS3PfsDal';
import { IPfsGetter } from '../../DAL/IPfsGetter';
import { IPfsMutator } from '../../DAL/IPfsMutator';
import AbstractCommand from '../abstractCommand';
import { RollbackAlgorithmFactory } from '../TransactionalCommands/RollbackAlgorithms/rollbackAlgorithmFactory'

export class UnlockTransactionsCommand extends AbstractCommand 
{
	public async execute(): Promise<any>
    {
        console.log("Transaction Unlock job: Starting unlock job...");
        await this.unlockPostTransactions();
        await this.unlockHideTransactions();
        console.log("Transaction Unlock job: Transaction unlock job completed.");

	}

    private async unlockPostTransactions()
    {
        const transactionType = 'post';
        await this.unlockTransactionsOfType(transactionType);
    }

    private async unlockHideTransactions()
    {
        const transactionType = 'hide';
        await this.unlockTransactionsOfType(transactionType);
    }

    private async unlockTransactionsOfType(transactionType: string)
    {
        console.log(`Transaction Unlock job: Unlocking '${transactionType}' transactions...`);

        let page = 1;
        let lockedObjects: Array<AddonData> = [];

		do
        {
            const findOptions: FindOptions = {
                page: page,
                page_size: 100,
                // Hidden items are simply items who's saved data is Hidden=true. We still need to deal with them. 
                // Deleted transactions are hard-deleted, so this will not return "Hidden" transactions.
                include_deleted: true,
                where:`TransactionType=${transactionType}`
            }
            
            lockedObjects = await this.pfsGetter.getLockedObjects(findOptions);

            for(const lockedObject of lockedObjects)
            {
                await this.invokeRollbackForLockedObject(lockedObject);
            }

            page++;
        }
        while (lockedObjects.length > 0);

        console.log(`Transaction Unlock job: Done unlocking '${transactionType}' transactions.`)

    }


    private async invokeRollbackForLockedObject(lockedObject: AddonData)
    {
        if (lockedObject?.Key)
        {
            // Since the unlockTransactions command will be issued by PFS, (and not
            // by the actual Owner addon) there's not enough data on the request to
            // properly call the rollback algorithm. There's a need to imitate a call
            // from the OwnerUUID with the schema name. This data can be extracted
            // from the Key of the locked object.

            const imitationRequest = this.getImitationRequest(lockedObject);

            const dal = new IndexedDataS3PfsDal(this.client, imitationRequest, MAXIMAL_LOCK_TIME);
            const pfsGetter: IPfsGetter = dal;
            const pfsMutator: IPfsMutator = dal;

            lockedObject.Key = this.getRelativePath(lockedObject.Key);

            try
            {
                console.log(`Transaction Unlock job: Trying to unlock key '${lockedObject.Key}', lock type: ${lockedObject.TransactionType}, schema name: ${imitationRequest.query.resource_name}, AddonUUID: ${imitationRequest.query.addon_uuid}`);
                const shouldForceRollback = this.request.query.forceRollback; // This should be used for testing
                await RollbackAlgorithmFactory.getRollbackAlgorithm(this.client, imitationRequest, pfsMutator, pfsGetter, lockedObject).rollback(shouldForceRollback);
                console.log(`Transaction Unlock job: Invoked a rollback request.`);

            }
            catch(error)
            {
                if(error instanceof Error)
                {
                    console.log(`Transaction Unlock job: ${JSON.stringify(error.message)}`);
                }
            }
        }
    }

    getRelativePath(Key: string): string
    {
        // Keys are in the format of "distributor_uuid/addon_uuid/resource_name/key".
        const splitKey = Key.split('/');
        const relativeKey = splitKey.slice(3).join('/');
        return relativeKey;
    }

    private getImitationRequest(lockedObject: AddonData)
    {
        if (lockedObject?.Key)
        {
            // Keys are in the format of "distributor_uuid/addon_uuid/resource_name/key".
            const splitKey = lockedObject.Key.split('/');
            const lockedObjectAddonUUID = splitKey[1];
            const lockedObjectResourceName = splitKey[2];

            const requestCopy = { ...this.request };
            requestCopy.query.addon_uuid = lockedObjectAddonUUID;
            requestCopy.query.resource_name = lockedObjectResourceName;
            requestCopy.body.Key = this.getRelativePath(lockedObject.Key);

            return requestCopy;
        }
        else
        {
            // This will never happen, and is just here to keep the compiler happy.
            throw new Error('Key is not defined');
        }
    }
}