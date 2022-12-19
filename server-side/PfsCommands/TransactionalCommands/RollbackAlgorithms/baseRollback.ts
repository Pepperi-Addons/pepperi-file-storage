import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { IPfsGetter, IPfsMutator } from "pfs-shared";
import PfsService from "../../pfs.service";
import { IRollbackAlgorithm } from "./iRollbackAlgorithm";

export abstract class BaseRollbackAlgorithm extends PfsService implements IRollbackAlgorithm 
{
    constructor (client: Client,
				request: Request,
				pfsMutator: IPfsMutator,
				pfsGetter: IPfsGetter,
				protected lockedFile: any)
	{
		super(client, request, pfsMutator, pfsGetter);
	}

	abstract rollbackImplementation(): Promise<void>;

	async rollback(force? : boolean): Promise<void>
	{
		if (this.lockedFile) 
		{
			const timePassedSinceLock = (new Date().getTime()) - (new Date(this.lockedFile.CreationDateTime)).getTime();

			if (force || timePassedSinceLock > this.pfsMutator.getMaximalLockTime()) 
			{
				await this.rollbackImplementation();
			}

			else 
			{
				const err: any = new Error(`The requested key ${this.request.body.Key} is currently locked for ${timePassedSinceLock} ms, which is less then the maixmal ${this.pfsMutator.getMaximalLockTime()} ms. To allow the current transaction to finish executing, please try again later.`);
				err.code = 409; // Conflict code. This response is sent when a request conflicts with the current state of the server.
				throw err;
			}
		}
	}

	protected rollbackLogger(){
		console.error(`Rollback algorithm invoked for key: ${this.lockedFile.Key}, Transaction Type: ${this.lockedFile.TransactionType}`);
	}
}