import { AddonFile } from "@pepperi-addons/papi-sdk";

import { APostOfflineTests } from "../../aPostOffline.test";


export class DeleteFileOfflineTest extends APostOfflineTests
{
	tests(describe: (suiteTitle: string, func: () => void) => void,
		it: (name: string, fn: Mocha.Func) => void,
		expect: Chai.ExpectStatic,
	): void 
	{
		describe(this.title, () => 
		{
			it("Delete file offline, sync, and ensure it is deleted online", async () => 
			{
				console.log(`${this.title} - Starting test ${it.name}`);

				// Get file online
				const onlineFileBeforeDeletion = await this.pfsOnlineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName);
				const fileBufferBeforeDeletion = await this.filesFetcherService.downloadFile(onlineFileBeforeDeletion.URL!);
				const thumbnailBufferBeforeDeletion = await this.filesFetcherService.downloadFile(onlineFileBeforeDeletion.Thumbnails![0].URL!);

				// Delete file offline
				const deleteFile: AddonFile = {
					Key: await this.prefixedOnlineTestFileName,
					Hidden: true,
					...(this.testsExecutor.getIntegrationTestBody() ?? {})
				};
				await this.pfsOfflineService.post(this.pfsSchemaName, deleteFile);

				// Sync
				await this.syncWithValidation(expect, {finish: true, success: true}, async () => {
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

				// Get file online and ensure it is deleted
				const onlineFileAfterDeletion = await this.pfsOnlineService.getByKey(this.pfsSchemaName, await this.prefixedOnlineTestFileName);
				expect(onlineFileAfterDeletion).to.have.property("Hidden").that.is.true;

				// Try getting the file's data and it's thumbnail, and ensure they are deleted
				const fileBufferAfterDeletion = await this.filesFetcherService.downloadFile(onlineFileAfterDeletion.URL!);
				const thumbnailBufferAfterDeletion = await this.filesFetcherService.downloadFile(onlineFileAfterDeletion.Thumbnails![0].URL!);

				expect(fileBufferAfterDeletion).to.not.deep.equal(fileBufferBeforeDeletion);
				expect(thumbnailBufferAfterDeletion).to.not.deep.equal(thumbnailBufferBeforeDeletion);
			});
        });
    }
}