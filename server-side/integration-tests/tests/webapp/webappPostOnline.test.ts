import { PostOnlineTest } from "../generic-tests/postOnline.test";
import { AWebAppOfflineTest } from "./aWebAppOffline.test";


export class WebAppPostOnlineTest extends AWebAppOfflineTest
{
	subtitle = "Online Post";

	tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void
	{
		const postOnlineTest = new PostOnlineTest(this);
		postOnlineTest.init(this.container);
		postOnlineTest.tests(describe, it, expect);
	}
}
