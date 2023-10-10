import { AddonFile } from "@pepperi-addons/papi-sdk";

import { IntegrationTestBody } from "pfs-shared";
import { AMobileOfflineTest } from "./aMobileOffline.test";


export class MobilePostWhileOfflineTest extends AMobileOfflineTest
{
    subtitle: string = "Offline Post While Offline";

    public override tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void 
	{
		describe(this.title, () => 
		{
			it("Simulate offline mode - POST while offline, initiate job to upload temp file, sync online", async () => 
			{
				console.log(`${this.title} - Starting test ${it.name}`);
				
                const offlineModePostFileName = `fail${await this.prefixedOfflineTestFileName}`;
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
				// await this.waitForAsyncJob(5); // wait for the upload process to fail

				// try to sync, to initiate the job uploading the file
				// This sync should fail, since there are files to upload.

				// await this.sync(expect, {finish: false, success: false});

				await this.waitForAsyncJob(5); // wait for the upload process to succeed

				// Sync should now succeed
				await this.syncWithValidation(expect, {finish: true, success: true}, async() => {
                    let res: boolean;
                    try {
                        await this.pfsOnlineService.getByKey(this.pfsSchemaName, offlineModePostFileName);
                        res = true;
                    } 
                    catch (error) {
                        res = false;
                    }

                    return res;
                });

				await this.validateOnlineFile(expect, offlineModePostFileName);
			});
		});
	}
}