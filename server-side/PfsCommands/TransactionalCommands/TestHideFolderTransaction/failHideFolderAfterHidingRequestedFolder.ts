import { TestError } from "../../../constants";
import { SyncHideFolderTransactionalCommand } from "../syncHideFolderTransactionalCommand";

export class FailHideFolderAfterHidingRequestedFolder extends SyncHideFolderTransactionalCommand{
	
    async executeTransaction(): Promise<any>
	{	
		// Hide the requested folder
		await this.hideRequestedFolder();

		throw new TestError('Test lock mechanism: Hide Folder: Fail after marking requested folder as Hidden. Subtree is still Hidden: false.');
    }	
}
