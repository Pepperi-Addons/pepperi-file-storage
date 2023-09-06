import { AddonFile } from "@pepperi-addons/papi-sdk";

import { APostOfflineTests } from "./aPostOffline.test";
import { testFileData } from "./constants";
import { IntegrationTestBody } from "pfs-shared";


export class MobileOfflineTests extends APostOfflineTests
{
	title = "Mobile Offline tests";
	
	public override tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void 
	{
		super.tests(describe, it, expect);

		describe(this.title, () => 
		{
			it("Simulate offline mode - POST while offline, initiate job to upload temp file, sync online", async () => 
			{
				const offlineModePostFileName = `fail_${this.offlineTestFileName}`;
				const integrationTestBody: IntegrationTestBody = {
					IntegrationTestData: {
						IsWebApp: false,
						ShouldDeleteURLsCache: true,
						ShouldFailTemporaryFile: true
					}
				};
				// POST a file offline
				const file: AddonFile = {
					Key: offlineModePostFileName,
					MIME: "image/png",
					Cache: false,
					Sync: "Always",
					...(await this.getPostFileData()),
					...integrationTestBody
				};

				await this.pfsOfflineService.post(this.pfsSchemaName, file);
				await this.waitForAsyncJob(5); // wait for the upload process to fail

				// try to sync, to initiate the job uploading the file
				// This sync should fail, since there are files to upload.

				await this.sync(expect, {finish: false, success: false});

				await this.waitForAsyncJob(5); // wait for the upload process to succeed

				// Sync should now succeed
				await this.sync(expect);

				await this.validateOnlineFile(expect, offlineModePostFileName);
			});
		});
	}

	protected getExpectedOfflineUrlRegex(): RegExp
	{
		return /localhost/i;
	}

	protected async getPostFileData(): Promise<{URI: string}>
	{
		return { URI: testFileData };
	}

	protected async ensureLocalFileIsValid(offlineFile: AddonFile, expect: Chai.ExpectStatic): Promise<void>
	{
		// Since on mobile we expect localhost URLs, we cannot get the actual file from the URL.
	}

	protected getIntegrationTestBody(): IntegrationTestBody
	{
		const integrationTestBody: IntegrationTestBody = {
			IntegrationTestData: {
				IsWebApp: false,
				ShouldDeleteURLsCache: true,
			}
		};

		return integrationTestBody;
	}
}
