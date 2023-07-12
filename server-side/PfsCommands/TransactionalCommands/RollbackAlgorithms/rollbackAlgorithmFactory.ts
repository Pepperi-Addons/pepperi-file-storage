import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { IPfsGetter, IPfsMutator } from "pfs-shared";
import { HideFolderRollbackAlgorithm } from "./hideFolderRollback";
import { IRollbackAlgorithm } from "./iRollbackAlgorithm";
import { PostRollbackAlgorithm } from "./postRollback";

export class RollbackAlgorithmFactory
{
	public static getRollbackAlgorithm(client: Client, request: Request, pfsMutator: IPfsMutator, pfsGetter: IPfsGetter, lockedFile: any): IRollbackAlgorithm
	{
		// Creating a new concrete class that implements the ITransactionalCommand interface
		// must also include a new implementation of the IRollbackAlgorithm interface. 
		// This new IRollbackAlgorithm implementation should be added to the
		// RollbackAlgorithmFactory.getRollbackAlgorithm() factory.

		switch(lockedFile.TransactionType)
		{
		case "post":
			return new PostRollbackAlgorithm(client, request, pfsMutator, pfsGetter, lockedFile);
		case "hide":
			return new HideFolderRollbackAlgorithm(client, request, pfsMutator, pfsGetter, lockedFile);
		default:
			throw new Error(`Could not find a rollback algorithm for transaction of type: '${lockedFile.TransactionType}'`);
		}
	}
}

export default RollbackAlgorithmFactory;
