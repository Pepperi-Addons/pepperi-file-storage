import { AddonFile } from "@pepperi-addons/papi-sdk";
import jwtDecode from "jwt-decode";

import { APostOfflineTests } from "../../aPostOffline.test";
import { testFileData } from "../../constants";
import { ArbitraryPrefixService } from "../../services/arbitraryPrefix.service";


export class OfflinePostTest extends APostOfflineTests
{
    tests(describe: (suiteTitle: string, func: () => void) => void,
		it: (name: string, fn: Mocha.Func) => void,
		expect: Chai.ExpectStatic,
	): void 
	{
		describe(this.title, () => 
		{
			it("Post a file offline and sync it", async () => 
			{
				console.log(`${this.title} - Starting test ${it.name}`);

				// POST a file offline
				const file: AddonFile = {
					Key: await this.prefixedOfflineTestFileName,
					MIME: "image/png",
					URI: testFileData,
					Cache: false,
					Sync: "Always",
					...(this.testsExecutor.getIntegrationTestBody() ?? {})
				};

				await this.pfsOfflineService.post(this.pfsSchemaName, file);

				// wait for the file to be uploaded
				this.waitForAsyncJob();

				// Sync it
				await this.syncWithValidation(expect, {finish: true, success: true}, async () =>{
					let res: boolean;
					try {
						await this.pfsOnlineService.getByKey(this.pfsSchemaName, await this.prefixedOfflineTestFileName);
						res = true;
					} catch (error) {
						res = false;
					}

					return res;
				});

				// Make sure it is synced
				await this.validateOnlineFile(expect, await this.prefixedOfflineTestFileName);
			});

			it("Post a file offline, delete it offline and sync it", async () => 
			{
				console.log(`${this.title} - Starting test ${it.name}`);

				const offlineFileToDeleteKey: string = await this.arbitraryPrefixService.addPrefixToString("offlineFileToDeleteKey.png");
				// POST a file offline
				const file: AddonFile = {
					Key: offlineFileToDeleteKey,
					MIME: "image/png",
					URI: testFileData,
					Cache: false,
					Sync: "Always",
					...(this.testsExecutor.getIntegrationTestBody() ?? {})
				};

				await this.pfsOfflineService.post(this.pfsSchemaName, file);

				// wait for the file to be uploaded
				this.waitForAsyncJob(10, `Await for file ${offlineFileToDeleteKey} to be uploaded to TempFile`);

				// Delete the file offline
				await this.pfsOfflineService.post(this.pfsSchemaName, {
					Key: offlineFileToDeleteKey,
					Hidden: true,
					...(this.testsExecutor.getIntegrationTestBody() ?? {})
				});

				// Sync it
				await this.syncWithValidation(expect, {finish: true, success: true}, async () =>{
					let res: boolean;
					try {
						const validateOnlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, offlineFileToDeleteKey);
						res = validateOnlineFile.Hidden!;
					} catch (error) {
						res = false;
					}

					return res;
				});

				// Make sure it is synced
				const onlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, offlineFileToDeleteKey);
				expect(onlineFile).to.not.be.undefined;
				expect(onlineFile.Key).to.equal(file.Key);
				expect(onlineFile).to.have.property("Hidden").that.is.true;

				// Validate URL
				expect(onlineFile).to.have.property("URL").that.is.a("string").and.is.not.empty;
				expect(onlineFile.URL).to.include("pfs.");
				const distributorUUID = jwtDecode(this.container.client.OAuthAccessToken)["pepperi.distributoruuid"];
				expect(onlineFile.URL).to.include(`${distributorUUID}/${this.container.client.AddonUUID}/${this.pfsSchemaName}/${offlineFileToDeleteKey}`);

				// Ensure the file exists in the provided URL
				const url = onlineFile.URL!;
				const buffer: Buffer = await this.filesFetcherService.downloadFile(url);
				expect(buffer.length).to.not.equal(onlineFile.FileSize);
			});
        });
    }
}