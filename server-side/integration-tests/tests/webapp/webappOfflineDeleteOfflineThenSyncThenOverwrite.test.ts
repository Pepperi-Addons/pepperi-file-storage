import { AddonFile } from "@pepperi-addons/papi-sdk";

import { orangeDotPngDataUri, testFileData } from "../../constants";
import { AWebAppOfflineTest } from "./aWebAppOffline.test";
import { DataUriToMD5Builder } from "../../utilities/data-uri-to-md5.builder";


export class WebappOfflineDeleteOfflineThenSyncThenOverwriteTest extends AWebAppOfflineTest
{
	subtitle = "Offline delete, sync, update file, sync, validate file data - DI-26277";

	public override tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void 
	{
		describe(this.title, () => 
		{
			it("Simulate offline mode - Delete offline, sync, and update file data offline", async () => 
			{
				console.log(`${this.title} - Starting test ${it.name}`);

				await this.uploadFileOnline(expect);

				await this.deleteFileOffline();

				await this.syncWithValidation(expect, {finish: true, success: true}, async () => 
				{
					let res: boolean;
					try
					{
						const validateOnlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName);
						res = validateOnlineFile?.Hidden === true;
					}
					catch(error)
					{
						res = false;
					}
					
					return res;
				});

				await this.postUnhiddenFileOfflineWithData(orangeDotPngDataUri);

				await this.syncWithValidation(expect, {finish: true, success: true}, async () => 
				{
					let res: boolean;
					try
					{
						const validateOnlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName);
						res = validateOnlineFile?.Hidden === false;
					}
					catch(error)
					{
						res = false;
					}
					
					return res;
				});

				await this.validateOfflineFileHasData(orangeDotPngDataUri, expect);
			});
		});
	}

	protected async uploadFileOnline(expect: Chai.ExpectStatic): Promise<void>
	{
		const file: AddonFile = {
			Key: await this.prefixedOnlineTestFileName,
			MIME: "image/png",
			Cache: false,
			Sync: "Always",
			// Since we use Thumbnails, TemporaryFileURLs cannot be used, and we must use URI
			URI: testFileData,
		};

		await this.pfsOnlineService.post(this.pfsSchemaName, file);

		await this.waitForAsyncJob(10, `Awaiting online POST to propagate to Sync`);

		// Sync
		await this.syncWithValidation(expect, { finish: true, success: true }, async () => 
		{
			let res: boolean;
			try 
			{
				await this.pfsOfflineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName, this.getIntegrationTestBody());
				res = true;
			}
			catch (error) 
			{
				res = false;
			}

			return res;
		});

		await this.validateOfflineFileHasData(file.URI!, expect);
	}

	protected async deleteFileOffline(): Promise<void>
	{
		const deleteFile: AddonFile = {
			Key: await this.prefixedOnlineTestFileName,
			Hidden: true,
			...(this.getIntegrationTestBody() ?? {})
		};
		await this.pfsOfflineService.post(this.pfsSchemaName, deleteFile);
	}

	protected async postUnhiddenFileOfflineWithData(dataUri: string): Promise<void>
	{
		const file: AddonFile = {
			Key: await this.prefixedOnlineTestFileName,
			URI: dataUri,
			Hidden: false,
			MIME: "image/png",
			...(this.getIntegrationTestBody() ?? {})
		};

		await this.pfsOfflineService.post(this.pfsSchemaName, file);
	}

	async validateOfflineFileHasData(dataUri: string, expect: Chai.ExpectStatic): Promise<void>
	{
		const integrationTestBody = this.getIntegrationTestBody();

		const offlineFile = await this.pfsOfflineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName, integrationTestBody);

		// Make sure it is synced
		expect(offlineFile).to.not.be.undefined;

		// Validate URL
		expect(offlineFile).to.have.property("URL").that.is.a("string").and.is.not.empty;
		expect(offlineFile.URL).to.match(this.getExpectedOfflineUrlRegex());

		// Ensure the file exists in the provided URL
		const dataUriToMD5Builder = new DataUriToMD5Builder();
		const expectedMD5 = dataUriToMD5Builder.build(dataUri);
		await this.ensureLocalFileIsValid(offlineFile, expectedMD5, expect);
	}
}
