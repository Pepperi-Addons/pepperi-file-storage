import { SyncResult } from "@pepperi-addons/addon-testing-framework";
import { AddonDataScheme, AddonFile } from "@pepperi-addons/papi-sdk";
import jwtDecode from "jwt-decode";
import { IntegrationTestBody } from "pfs-shared";

import { ABaseOfflinePfsTests } from "./aBaseOfflinePfsTests.test";
import { testFileData } from "./constants";


export abstract class APostOfflineTests extends ABaseOfflinePfsTests
{
	protected abstract getPostFileData(): Promise<{URI: string} | {TemporaryFileURLs: string[]}>;
	protected abstract getExpectedOfflineUrlRegex(): RegExp;
	protected abstract ensureLocalFileIsValid(offlineFile: AddonFile, expect: Chai.ExpectStatic): Promise<void>;
	protected abstract getIntegrationTestBody(): IntegrationTestBody
	
	
	tests(describe: (suiteTitle: string, func: () => void) => void,
		it: (name: string, fn: Mocha.Func) => void,
		expect: Chai.ExpectStatic,
	): void 
	{
		describe(this.title, () => 
		{
			it('Post a file online and sync it', async () => 
			{
				
				// POST a file online
				const file: AddonFile = {
					Key: this.onlineTestFileName,
					MIME: 'image/png',
					Cache: false,
					Sync: "Always",
					Thumbnails: [
						{
							Size: "200x200"
						}
					],
					...(this.getPostFileData())
				};

				await this.pfsOnlineService.post(this.pfsSchemaName, file);

				// Sync it
				await this.sync(expect);

				// Make sure it is synced
				const offlineFile = await this.pfsOfflineService.getByKey(this.pfsSchemaName, this.onlineTestFileName);
				expect(offlineFile).to.not.be.undefined;
				expect(offlineFile.Key).to.equal(file.Key);

				// Validate URL
				expect(offlineFile).to.have.property("URL").that.is.a('string').and.is.not.empty;
				expect(offlineFile.URL).to.match(this.getExpectedOfflineUrlRegex());

				// Ensure the file exists in the provided URL
				await this.ensureLocalFileIsValid(offlineFile, expect);
			});

			it('Delete file offline, sync, and ensure it is deleted online', async () => 
			{
				// Get file online
				const onlineFileBeforeDeletion = await this.pfsOnlineService.getByKey(this.pfsSchemaName, this.onlineTestFileName);
				const fileBufferBeforeDeletion = await this.filesFetcherService.downloadFile(onlineFileBeforeDeletion.URL!);
				const thumbnailBufferBeforeDeletion = await this.filesFetcherService.downloadFile(onlineFileBeforeDeletion.Thumbnails![0].URL!);

				// Delete file offline
				const deleteFile: AddonFile = {
					Key: this.onlineTestFileName,
					Hidden: true,
					...(this.getIntegrationTestBody() ?? {})
				};
				await this.pfsOfflineService.post(this.pfsSchemaName, deleteFile);

				// Sync
				await this.sync(expect);

				// Get file online and ensure it is deleted
				const onlineFileAfterDeletion = await this.pfsOnlineService.getByKey(this.pfsSchemaName, this.onlineTestFileName);
				expect(onlineFileAfterDeletion).to.have.property("Hidden").that.is.true;

				// Try getting the file's data and it's thumbnail, and ensure they are deleted
				const fileBufferAfterDeletion = await this.filesFetcherService.downloadFile(onlineFileAfterDeletion.URL!);
				const thumbnailBufferAfterDeletion = await this.filesFetcherService.downloadFile(onlineFileAfterDeletion.Thumbnails![0].URL!);

				expect(fileBufferAfterDeletion).to.not.deep.equal(fileBufferBeforeDeletion);
				expect(thumbnailBufferAfterDeletion).to.not.deep.equal(thumbnailBufferBeforeDeletion);
			});

			it('Post a file offline and sync it', async () => 
			{
				// POST a file offline
				const file: AddonFile = {
					Key: this.offlineTestFileName,
					MIME: 'image/png',
					URI: testFileData,
					Cache: false,
					Sync: "Always",
					...(this.getIntegrationTestBody() ?? {})
				};

				await this.pfsOfflineService.post(this.pfsSchemaName, file);

				// wait for the file to be uploaded
				this.waitForAsyncJob();

				// Sync it
				await this.sync(expect);

				// Make sure it is synced
				await this.validateOnlineFile(expect, this.offlineTestFileName);
			});

			it('Post a file offline, delete it offline and sync it', async () => 
			{
				const offlineFileToDeleteKey = "offlineFileToDeleteKey.png";
				// POST a file offline
				const file: AddonFile = {
					Key: offlineFileToDeleteKey,
					MIME: 'image/png',
					URI: testFileData,
					Cache: false,
					Sync: "Always",
					...(this.getIntegrationTestBody() ?? {})
				};

				await this.pfsOfflineService.post(this.pfsSchemaName, file);

				// wait for the file to be uploaded
				this.waitForAsyncJob();

				// Delete the file offline
				await this.pfsOfflineService.post(this.pfsSchemaName, {
					Key: offlineFileToDeleteKey,
					Hidden: true,
					...(this.getIntegrationTestBody() ?? {})
				});

				// Sync it
				await this.sync(expect);

				// Make sure it is synced
				const onlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, offlineFileToDeleteKey);
				expect(onlineFile).to.not.be.undefined;
				expect(onlineFile.Key).to.equal(file.Key);
				expect(onlineFile).to.have.property("Hidden").that.is.true;

				// Validate URL
				expect(onlineFile).to.have.property("URL").that.is.a('string').and.is.not.empty;
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

	/**
	 * Gets the file using the fileKey online, and ensure the online URL is valid
	 * and that the data was successfully uploaded to S3, comparing the actual file
	 * data size to the value in the FileSize property of the online file.
	 * @param {Chai.ExpectStatic} expect
	 * @param {string} fileKey - The Key to get online and validate. 
	 */
	protected async validateOnlineFile(expect: Chai.ExpectStatic, fileKey: string): Promise<void>
	{
		const onlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, fileKey);
		expect(onlineFile).to.not.be.undefined;
		expect(onlineFile.Key).to.equal(fileKey);

		// Validate URL
		expect(onlineFile).to.have.property("URL").that.is.a('string').and.is.not.empty;
		expect(onlineFile.URL).to.include("pfs.");
		const distributorUUID = jwtDecode(this.container.client.OAuthAccessToken)["pepperi.distributoruuid"];
		expect(onlineFile.URL).to.include(`${distributorUUID}/${this.container.client.AddonUUID}/${this.pfsSchemaName}/${this.offlineTestFileName}`);

		// Ensure the file exists in the provided URL
		const url = onlineFile.URL!;
		const buffer: Buffer = await this.filesFetcherService.downloadFile(url);
		expect(buffer).to.not.be.undefined;
		expect(buffer.length).to.be.equal(onlineFile.FileSize);
	}

	/**
	 * Performs a sync and asserts the result.
	 */
	protected async sync(expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {success: true, finish: true}): Promise<void>
	{
		const syncResult = await this.pfsOfflineService.sync();

		expect(syncResult).to.not.be.undefined;
		expect(syncResult.success).to.equal(expectedSyncResult.success);
		expect(syncResult.finish).to.equal(expectedSyncResult.finish);
	}

	/**
	 * If the schema exists, purges it, and waits for any PNS notifications to resolve.
	 * @returns {Promise<void>}
	 */
	protected async ensureSchemaDoesntExist(): Promise<void>
	{
		let existingSchema: AddonDataScheme | undefined;
		try {
			existingSchema = await this.pfsOnlineService.getSchema(this.pfsSchemaName);
		}
		catch (err) {
			// Schema not found
		}

		if (existingSchema) {
			await this.pfsOnlineService.purgePfsSchema(this.pfsSchemaName);
			// Await any PNS notifications to resolve.
			// this.waitForAsyncJob();
		}
	}

	/**
	 * Creates a PFS schema online.
	 * @returns {Promise<AddonDataScheme>} - A promise that resolves to the created schema.
	 */
	protected async createPfsSchema(): Promise<AddonDataScheme>
	{
		const schema: AddonDataScheme = {
			Name: this.pfsSchemaName,
			SyncData: {
				Sync: true,
			},
			Type: "pfs",
		};

		return await this.pfsOnlineService.createPfsSchema(schema);
	}
}
