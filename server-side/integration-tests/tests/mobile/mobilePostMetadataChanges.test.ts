import { PostMetadataChangesTest } from "../generic-tests/postMetadataChanges.test";
import { AMobileOfflineTest } from "./aMobileOffline.test";


export class MobilePostMetadataChangesTest extends AMobileOfflineTest
{
    subtitle: string = "Post Metadata Changes";

    tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void
    {
        const postMetadataChangesTest = new PostMetadataChangesTest(this);
        postMetadataChangesTest.init(this.container);
        postMetadataChangesTest.tests(describe, it, expect);
    }
}