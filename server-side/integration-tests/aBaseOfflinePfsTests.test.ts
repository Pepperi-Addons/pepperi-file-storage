import { SyncResult } from "@pepperi-addons/addon-testing-framework";

import { ABasePfsTests } from "./aBasePfsTests.test";


export abstract class ABaseOfflinePfsTests extends ABasePfsTests
{
	protected readonly pfsSchemaName = `PfsOfflineTest`;
	protected readonly onlineTestFileName = "test.png";
	protected readonly offlineTestFileName = "offlineTest.png";

	/**
	 * Performs a sync and asserts the result.
	 */
	protected async sync(expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {finish: true, success: true}): Promise<void>
	{
		const syncResult = await this.pfsOfflineService.sync();
		this.validateSyncResult(syncResult, expect, expectedSyncResult);
		this.waitForAsyncJob();
	}

	/**
	 * Performs a resync and asserts the result.
	 */
	protected async resync(expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {finish: true, success: true}): Promise<void>
	{
		const syncResult = await this.pfsOfflineService.resync();
		this.validateSyncResult(syncResult, expect, expectedSyncResult);
		this.waitForAsyncJob();

	}

	protected validateSyncResult(syncResult: SyncResult, expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {finish: true, success: true}): void
	{
		expect(syncResult).to.not.be.undefined;
		expect(syncResult.success).to.equal(expectedSyncResult.success);
		expect(syncResult.finish).to.equal(expectedSyncResult.finish);
	}
}
