import AbstractCommand from "../abstractCommand";
import { ABaseTransactionalCommand } from "./aBaseTransactionalCommand";
import { SyncHideFolderTransactionalCommand } from "./syncHideFolderTransactionalCommand";
import { PostTransactionalCommand } from "./postTransactionalCommand";
import { FailHideFolderAfterHidingRequestedFolder } from "./TestHideFolderTransaction/failHideFolderAfterHidingRequestedFolder";

export class TransactionalCommandExecutor extends AbstractCommand
{
    public async execute(): Promise<any>
    {
        let transactionalCommand: ABaseTransactionalCommand;
        await this.getCurrentItemData();

        // If trying to Hide an existing folder, use the SyncHideFolderTransactionalCommand
        if(this.request.body.Key.endsWith('/') && this.existingFile.doesFileExist && this.request.body.Hidden && !this.existingFile.Hidden)
        {
            // testing_transaction query param is used to test the transactions and rollback mechanisms.
            if(this.request.query.testing_transaction === 'stop_after_hiding_folder')
            {
                transactionalCommand = new FailHideFolderAfterHidingRequestedFolder(this.client, this.request, this.pfsMutator, this.pfsGetter);
            }
            else
            {
                transactionalCommand = new SyncHideFolderTransactionalCommand(this.client, this.request, this.pfsMutator, this.pfsGetter);
            }
        }
        else
        {
            transactionalCommand = new PostTransactionalCommand(this.client, this.request, this.pfsMutator, this.pfsGetter);
        }

        return await transactionalCommand.execute();
    }
}
