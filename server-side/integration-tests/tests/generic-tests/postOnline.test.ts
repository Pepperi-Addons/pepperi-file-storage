import { AddonFile } from "@pepperi-addons/papi-sdk";

import { APostOfflineTests } from "../../aPostOffline.test";
import { testFileData } from "../../constants";


export class PostOnlineTest extends APostOfflineTests
{
	tests(describe: (suiteTitle: string, func: () => void) => void,
		it: (name: string, fn: Mocha.Func) => void,
		expect: Chai.ExpectStatic,
	): void 
	{
		describe(this.title, () => 
		{
			it("Post a file online and sync it", async () => 
			{
				// Init the prefix service
				await this.arbitraryPrefixService.init();

				console.log(`${this.title} - Starting test ${it.name}`);
				// POST a file online
				const file: AddonFile = {
					Key: await this.prefixedOnlineTestFileName,
					MIME: "image/png",
					Cache: false,
					Sync: "Always",
					Thumbnails: [
						{
							Size: "200x200"
						}
					],
					// Since we use Thumbnails, TemporaryFileURLs cannot be used, and we must use URI
					URI: testFileData,
				};

				await this.pfsOnlineService.post(this.pfsSchemaName, file);

				await this.waitForAsyncJob(10, `Awaiting online POST to propagate to Sync`);

				// Sync
				await this.syncWithValidation(expect, {finish: true, success: true}, async () => 
				{
					let res: boolean;
					try 
					{
						await this.pfsOfflineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName, this.testsExecutor.getIntegrationTestBody());
						res = true;
					}
					catch (error) 
					{
						res = false;
					}

					return res;
				});

				const integrationTestBody = this.testsExecutor.getIntegrationTestBody();

				const offlineFile = await this.pfsOfflineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName, integrationTestBody);

				// Make sure it is synced
				expect(offlineFile).to.not.be.undefined;
				expect(offlineFile.Key).to.equal(file.Key);

				// Validate URL
				expect(offlineFile).to.have.property("URL").that.is.a("string").and.is.not.empty;
				expect(offlineFile.URL).to.match(this.testsExecutor.getExpectedOfflineUrlRegex());

				// Ensure the file exists in the provided URL
				await this.testsExecutor.ensureLocalFileIsValid(offlineFile, expect);
			});
		});
	}
}
