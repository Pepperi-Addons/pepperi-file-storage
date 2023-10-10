import { DeleteFileOfflineTest } from "../generic-tests/deleteFileOffline.test";
import { AMobileOfflineTest } from "./aMobileOffline.test";


export class MobileDeleteFileOffline extends AMobileOfflineTest
{
	subtitle = "Delete file offline";

	tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void
	{
		const deleteOfflineFileTest = new DeleteFileOfflineTest(this);
		deleteOfflineFileTest.init(this.container);
		deleteOfflineFileTest.tests(describe, it, expect);
	}
}
