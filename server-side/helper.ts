import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { DEBUG_MAXIMAL_LOCK_TIME, MAXIMAL_LOCK_TIME } from "./constants";
import { IndexedDataS3PfsDal } from "./DAL/IndexedDataS3PfsDal";
import { FailAfterLock, FailAfterMutatingAdal, FailAfterMutatingS3 } from "./DAL/TestLockMechanism";

export class Helper
{
	public static DalFactory(client: Client, request: Request) 
	{
		if(!request.query)
		{
			request.query = {};
		}

		switch(request.query.testing_transaction)
		{
		//**** Testing scenarios ****//

		case "stop_after_lock":{
			return new FailAfterLock(client, request, DEBUG_MAXIMAL_LOCK_TIME);
		}
		case "stop_after_S3":{
			return new FailAfterMutatingS3(client, request, DEBUG_MAXIMAL_LOCK_TIME);
		}
		case "stop_after_ADAL":{
			return new FailAfterMutatingAdal(client, request, DEBUG_MAXIMAL_LOCK_TIME);
		}

		//**** End of testing scenarios ****//

		default:{
			return new IndexedDataS3PfsDal(client, request, request.query.testRollback ? 0 : MAXIMAL_LOCK_TIME);
		}
		}
	}
}