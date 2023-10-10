import { OfflinePostTest } from "../generic-tests/offlinePost.test";
import { AMobileOfflineTest } from "./aMobileOffline.test";


export class MobileOfflinePostTest extends AMobileOfflineTest
{
    subtitle: string = "Offline Post";

    tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void
    {
        const offlinePostTest = new OfflinePostTest(this);
        offlinePostTest.init(this.container);
        offlinePostTest.tests(describe, it, expect);
    }
}