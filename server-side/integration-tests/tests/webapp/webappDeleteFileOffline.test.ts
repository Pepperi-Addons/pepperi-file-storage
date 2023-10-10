import { DeleteFileOfflineTest } from "../generic-tests/deleteFileOffline.test";
import { AWebAppOfflineTest } from "./aWebAppOffline.test";


export class WebAppDeleteFileOffline extends AWebAppOfflineTest
{
    subtitle: string = "Delete file offline";

    tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void
    {
        const deleteOfflineFileTest = new DeleteFileOfflineTest(this);
        deleteOfflineFileTest.init(this.container);
        deleteOfflineFileTest.tests(describe, it, expect);
    }
}