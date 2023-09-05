import { AddonFile } from "@pepperi-addons/papi-sdk";
import fetch from "node-fetch";

import { APostOfflineTests } from "./aPostOffline.test";
import { testFileData } from "./constants";
import { IntegrationTestBody } from "pfs-shared";


export class MobileOfflineTests extends APostOfflineTests
{
	title = 'Mobile Offline tests';
	
	public override tests(describe: (suiteTitle: string, func: () => void) => void, it: (name: string, fn: Mocha.Func) => void, expect: Chai.ExpectStatic): void 
	{
		super.tests(describe, it, expect);

		describe(this.title, () => 
		{
			it('Simulate offline mode - POST while offline, initiate job to upload temp file, sync online', async () => 
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
					MIME: 'image/png',
					Cache: false,
					Sync: "Always",
					...(this.getPostFileData()),
					...integrationTestBody
				};

				await this.pfsOfflineService.post(this.pfsSchemaName, file);
				await this.waitForAsyncJob(5) // wait for the upload process to fail

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
		const temporaryFile = await this.pfsOnlineService.createTempFile();
		let fileBuffer: Buffer = this.getFileBufferFromDataUri();
		
		await this.putBufferToURL(fileBuffer, temporaryFile.PutURL);

		return {URI: testFileData};
	}

	private async putBufferToURL(fileBuffer: Buffer, url: string) {
		const fetchResult = await fetch(url, {
			method: 'PUT',
			body: fileBuffer,
		});

		if (!fetchResult.ok)
		{
			throw new Error(`Failed to upload file to ${url}`);
		}
	}

	private getFileBufferFromDataUri() {
		let fileBuffer: Buffer;

		const regex = /^data:.+\/(.+);base64,(.*)$/;
		const matches = testFileData.match(regex);
		if (matches?.length && matches?.length >= 3) {
			const ext = matches[1];
			const data = matches[2];
			fileBuffer = Buffer.from(data, 'base64');
		}

		else {
			throw new Error("Invalid file data");
		}
		return fileBuffer;
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
