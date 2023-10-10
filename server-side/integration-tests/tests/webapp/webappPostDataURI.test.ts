import { AddonFile } from "@pepperi-addons/papi-sdk";

import { testFileData } from "../../constants";
import { AWebAppOfflineTest } from "./aWebAppOffline.test";


export class WebAppPostDataUriTest extends AWebAppOfflineTest
{
	subtitle = "Post data URI";

	public override tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void 
	{
		describe(this.title, () => 
		{
			it("Post a file offline with data URI and sync it ", async () => 
			{
				console.log(`${this.title} - Starting test ${it}`);
				
				// POST a file offline
				const file: AddonFile = {
					Key: `dataUri${await this.prefixedOfflineTestFileName}`,
					MIME: "image/png",
					Cache: false,
					Sync: "Always",
					URI: testFileData,
					IntegrationTestData: {
						IsWebApp: true,
						ShouldDeleteURLsCache: true,
					}
				};

				// Post it offline
				await this.pfsOfflineService.post(this.pfsSchemaName, file);

				// Sync it
				await this.syncWithValidation(expect, {finish: true, success: true}, async () =>
				{
					let res: boolean;
					try 
					{
						await this.pfsOnlineService.getByKey(this.pfsSchemaName, file.Key!);
						res = true;
					}
					catch (error) 
					{
						res = false;
					}

					return res;
				});

				// Make sure it is synced
				this.validateOnlineFile(expect, file.Key!);
			});
		});
	}
}
