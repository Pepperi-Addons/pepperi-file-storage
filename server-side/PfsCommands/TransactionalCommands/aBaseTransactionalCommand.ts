import { TestError } from "../../constants";
import AbstractCommand from "../abstractCommand";
import { ITransactionalCommand } from "./iTransactionalCommand";
import { RollbackAlgorithmFactory } from "./RollbackAlgorithms/RollbackAlgorithmFactory";

export abstract class ABaseTransactionalCommand extends AbstractCommand implements ITransactionalCommand {
    abstract preLockLogic(): Promise<void>;
    abstract lock(): Promise<void>;
    abstract executeTransaction(): Promise<any>;
    abstract unlock(key: string): Promise<void>;
	
    public async execute(): Promise<any>{
        let res: any = {};

		try 
		{
			// Validate preliminary requirements
			await this.preLockLogic();

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
					await RollbackAlgorithmFactory.getRollbackAlgorithm(this.client, this.request, this.pfsMutator, this.pfsGetter, lockedFile).rollback();
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
			await RollbackAlgorithmFactory.getRollbackAlgorithm(this.client, this.request, this.pfsMutator, this.pfsGetter, lockedFile).rollback();
		}
    }

    public async rollback(): Promise<void>{
        const lockedFile = await this.pfsMutator.isObjectLocked(this.request.body.Key);

		if (lockedFile) 
		{
			await RollbackAlgorithmFactory.getRollbackAlgorithm(this.client, this.request, this.pfsMutator, this.pfsGetter, lockedFile).rollback();
		}
    }
}