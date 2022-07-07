import { TestError } from "../../constants";
import AbstractCommand from "../abstractCommand";
import { ITransactionalCommand } from "./iTransactionalCommand";

export abstract class ABaseTransactionalCommand extends AbstractCommand implements ITransactionalCommand {
    abstract preLockValidations(): Promise<void>;
    abstract lock(): Promise<void>;
    abstract executeTransaction(): Promise<any>;
    abstract rollback(lockedFile: any): Promise<void>;
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
					await this.rollback(lockedFile);
				}
			}
			
			throw err;
		}

		// Remove lock
		await this.unlock(this.request.body.Key);

		return res;
    }

    protected errorLogger(error: Error)
    {
        console.error(`${error.message}`);
    }
}