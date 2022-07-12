import { TestError } from "../../constants";
import AbstractCommand from "../abstractCommand";
import { ITransactionalCommand } from "./iTransactionalCommand";
import { HideFolderRollbackAlgorithm } from "./RollbackAlgorithms/hideFolderRollback";
import { IRollbackAlgorithm } from "./RollbackAlgorithms/iRollbackAlgorithm";
import { PostRollbackAlgorithm } from "./RollbackAlgorithms/postRollback";

export abstract class ABaseTransactionalCommand extends AbstractCommand implements ITransactionalCommand {
    abstract preLockValidations(): Promise<void>;
    abstract lock(): Promise<void>;
    abstract executeTransaction(): Promise<any>;
    abstract unlock(key: string): Promise<void>;
	
    public async execute(): Promise<any>{
        let res: any = {};

		try 
		{
			// Validate preliminary requirements
			await this.preLockValidations();

			// Set preliminary lock on the file. If necessary, this will also rollback an existing lock
			await this.lock();
		}
		catch(err)
		{
			if (err instanceof Error) 
			{
				this.errorLogger(err);
			}
			throw err;
		}

		try
		{
			res = await this.executeTransaction();
		}
		catch(err)
		{
			if (err instanceof Error) 
			{
				this.errorLogger(err);
			}
			
			if(!(err instanceof TestError))
			{
				// Perform rollback
				const lockedFile = await this.pfsMutator.isObjectLocked(this.request.body.Key);
				if (lockedFile) 
				{
					await this.getRollbackAlgorithm(lockedFile).rollback();
				}
			}
			
			throw err;
		}

		// Remove lock
		await this.unlock(this.request.body.Key ?? this.request.query.Key);

		return res;
    }

    protected errorLogger(error: Error)
    {
        console.error(`${error.message}`);
    }

    public async performRollback(): Promise<void> {
        const lockedFile = await this.pfsMutator.isObjectLocked(this.request.body.Key ?? this.request.query.Key);

		if (lockedFile) 
		{
			await this.getRollbackAlgorithm(lockedFile).rollback();
		}
    }

    protected getRollbackAlgorithm(lockedFile: any): IRollbackAlgorithm
    {
        // Creating a new concrete class that implements the ITransactionalCommand interface
        // must also include a new implementation of the IRollbackAlgorithm interface. 
        // This new IRollbackAlgorithm implementation should be added to the
        // ABaseTransactionalCommand.getRollbackAlgorithm() factory.

        switch(lockedFile.TransactionType)
        {
            case "post":
                return new PostRollbackAlgorithm(this.client, this.request, this.pfsMutator, this.pfsGetter, lockedFile);
			case "hide":
                return new HideFolderRollbackAlgorithm(this.client, this.request, this.pfsMutator, this.pfsGetter, lockedFile);
            default:
                throw new Error(`Could not find a rollback algorithm for transaction of type: '${lockedFile.TransactionType}'`);
        }
    }

    public async rollback(): Promise<void>{
        const lockedFile = await this.pfsMutator.isObjectLocked(this.request.body.Key);

		if (lockedFile) 
		{
			await this.getRollbackAlgorithm(lockedFile).rollback();
		}
    }
}