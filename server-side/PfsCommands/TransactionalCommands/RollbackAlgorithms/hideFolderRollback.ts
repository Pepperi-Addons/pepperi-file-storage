import { TestError } from "../../../constants";
import { HideFolderTransactionalCommand } from "../hideFolderTransactionalCommand";
import { BaseRollbackAlgorithm } from "./baseRollback";

export class HideFolderRollbackAlgorithm extends BaseRollbackAlgorithm 
{
    async rollbackImplementation(): Promise<void>
    {
        this.rollbackLogger();

		// We should actually call the async endpoint
		await (new HideFolderTransactionalCommand(this.client, this.request, this.pfsMutator, this.pfsGetter)).execute();

		console.log("Unlocking file...");
		await this.pfsMutator.unlock(this.lockedFile.Key);
		console.log("Done unlocking the file.");

		console.error(`Rollback algorithm has finished running for key: ${this.lockedFile.Key}`);

		if(this.request.query.testRollback) // If testing rollback, throw exception to stop the process after rollback.
		{
			throw new TestError("Testing rollback - finishing execution after rollback was done.");
		}
    }

}