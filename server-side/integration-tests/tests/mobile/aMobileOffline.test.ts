import { AddonFile } from "@pepperi-addons/papi-sdk";

import { IntegrationTestBody } from "pfs-shared";
import { APostOfflineTests, ITestsExecutor } from "../../aPostOffline.test";
import { testFileData } from "../../constants";


export abstract class AMobileOfflineTest extends APostOfflineTests implements ITestsExecutor
{
    abstract subtitle: string;

    public override get title(): string
    {
    	return `Mobile Offline - ${this.subtitle}`;
    }
    //#region ITestsExecutor implementation
    public getExpectedOfflineUrlRegex(): RegExp
    {
    	return /localhost/i;
    }

    public async getPostFileData(): Promise<{URI: string}>
    {
    	return { URI: testFileData };
    }

    public async ensureLocalFileIsValid(offlineFile: AddonFile, expectedFileMD5: string, expect: Chai.ExpectStatic): Promise<void>
    {
    	// Since on mobile we expect localhost URLs, we cannot get the actual file from the URL.
    }

    public getIntegrationTestBody(): IntegrationTestBody
    {
    	const integrationTestBody: IntegrationTestBody = {
    		IntegrationTestData: {
    			IsWebApp: false,
    			ShouldDeleteURLsCache: true,
    		}
    	};

    	return integrationTestBody;
    }

	//#endregion
}
