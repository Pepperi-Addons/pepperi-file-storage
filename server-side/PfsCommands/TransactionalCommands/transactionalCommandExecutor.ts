import AbstractCommand from "../abstractCommand";
import { ABaseTransactionalCommand } from "./aBaseTransactionalCommand";
import { SyncHideFolderTransactionalCommand } from "./syncHideFolderTransactionalCommand";
import { PostTransactionalCommand } from "./postTransactionalCommand";

export class TransactionalCommandExecutor extends AbstractCommand
{
    public async execute(): Promise<any>
    {
        let transactionalCommand: ABaseTransactionalCommand;
        await this.getCurrentItemData();

        // If trying to Hide an existing folder, use the SyncHideFolderTransactionalCommand
        if(this.request.body.Key.endsWith('/') && this.existingFile.doesFileExist && this.request.body.Hidden && !this.existingFile.Hidden)
        {
            transactionalCommand = new SyncHideFolderTransactionalCommand(this.client, this.request, this.pfsMutator, this.pfsGetter);
        }
        else
        {
            transactionalCommand = new PostTransactionalCommand(this.client, this.request, this.pfsMutator, this.pfsGetter);
        }

        return await transactionalCommand.execute();
    }
}
