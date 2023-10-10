import { AddonFile } from "@pepperi-addons/papi-sdk";

import { APostOfflineTests } from "../../aPostOffline.test";


export class PostMetadataChangesTest extends APostOfflineTests
{
	tests(describe: (suiteTitle: string, func: () => void) => void,
		it: (name: string, fn: Mocha.Func) => void,
		expect: Chai.ExpectStatic,
	): void 
	{
		describe(this.title, () => 
		{
			it("Update file description offline, and sync", async () => 
			{
				console.log(`${this.title} - Starting test ${it.name}`);

				// Update file description offline
				const updateFile: AddonFile = {
					Key: await this.prefixedOnlineTestFileName,
					Description: "Updated description offline",
					...(this.testsExecutor.getIntegrationTestBody() ?? {})
				};
				await this.pfsOfflineService.post(this.pfsSchemaName, updateFile);

				// Sync
				await this.syncWithValidation(expect, {finish: true, success: true}, async () => 
				{
					let res: boolean;
					try
					{
						const validateOnlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName);
						res = validateOnlineFile?.Description === updateFile.Description;
					}
					catch(error)
					{
						res = false;
					}

					return res;
				});

				// Get file online and ensure description was updated
				const onlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName);
				expect(onlineFile).to.have.property("Description").that.equals(updateFile.Description);
			});

			it("Update file description online, sync, and ensure it is updated offline", async () =>
			{
				console.log(`${this.title} - Starting test ${it.name}`);

				// Update file description online
				const updateFile: AddonFile = {
					Key: await this.prefixedOnlineTestFileName,
					Description: "Updated description online",
					...(this.testsExecutor.getIntegrationTestBody() ?? {})
				};

				await this.pfsOnlineService.post(this.pfsSchemaName, updateFile);

				await this.waitForAsyncJob(10, `Awaiting online POST to propagate to Sync`);

				// Sync
				await this.syncWithValidation(expect, {finish: true, success: true}, async () => 
				{
					let res: boolean;
					try
					{
						const validateOfflineFile = await this.pfsOfflineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName, this.testsExecutor.getIntegrationTestBody());
						res = validateOfflineFile?.Description === updateFile.Description;
					}
					catch(error)
					{
						res = false;
					}

					return res;
				});

				// Get file offline and ensure description was updated
				const offlineFile = await this.pfsOfflineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName, this.testsExecutor.getIntegrationTestBody());
				expect(offlineFile).to.have.property("Description").that.equals(updateFile.Description);
			});
		});
	}
}
