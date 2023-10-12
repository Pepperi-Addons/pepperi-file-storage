import { PostOnlineTest } from "../generic-tests/postOnline.test";
import { AMobileOfflineTest } from "./aMobileOffline.test";


export class MobilePostOnlineTest extends AMobileOfflineTest
{
	subtitle = "Online Post";

	tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void
	{
		const postOnlineTest = new PostOnlineTest(this);
		postOnlineTest.init(this.container);
		postOnlineTest.tests(describe, it, expect);
	}
}
