import { SyncResult } from "@pepperi-addons/addon-testing-framework";

import { ABasePfsTests } from "./aBasePfsTests.test";
import { ArbitraryPrefixService } from "./services/arbitraryPrefix.service";


export abstract class ABaseOfflinePfsTests extends ABasePfsTests
{
	protected readonly pfsSchemaName = `PfsOfflineTest`;
	private readonly _onlineTestFileName = "test.png";
	private readonly _offlineTestFileName = "offlineTest.png";

	private _arbitraryPrefixService: ArbitraryPrefixService | undefined;

	protected get prefixedOnlineTestFileName(): Promise<string>
	{
		return this.arbitraryPrefixService.addPrefixToString(this._onlineTestFileName);
	}

	protected get prefixedOfflineTestFileName(): Promise<string>
	{
		return this.arbitraryPrefixService.addPrefixToString(this._offlineTestFileName);
	}

	protected get arbitraryPrefixService(): ArbitraryPrefixService
	{
		if(!this._arbitraryPrefixService)
		{
			this._arbitraryPrefixService = new ArbitraryPrefixService(this.papiClient);
		}

		return this._arbitraryPrefixService;
	}

	/**
	 * Performs a sync and asserts the result.
	 */
	protected async sync(expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {finish: true, success: true}): Promise<void>
	{
		
		await this.pfsOfflineService.sync();
		this.waitForAsyncJob();
	}

	protected async syncWithValidation(expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {finish: true, success: true}, validationFunction?: () => Promise<boolean>): Promise<void>
	{
		const numberOfSyncs = validationFunction ? 5 : 1;
		// If no validation function is provided, we will sync only once
		let syncValidated = !validationFunction;
		let syncCounter = 0;
		do
		{
			console.log(`Syncing for the ${syncCounter + 1} time`);

			await this.sync(expect, expectedSyncResult);
			syncCounter++;

			if(!syncValidated)
			{
				syncValidated = await validationFunction!();
			}
		}
		while(syncCounter < numberOfSyncs && !syncValidated);

		if(!syncValidated)
		{
			throw new Error(`Sync failed to validate after ${syncCounter} attempts.`);
		}
	}

	/**
	 * Performs a resync and asserts the result.
	 */
	protected async resync(expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {finish: true, success: true}): Promise<void>
	{
		const syncResult = await this.pfsOfflineService.resync();
		this.waitForAsyncJob();
	}

	protected async resyncWithValidation(expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {finish: true, success: true}, validationFunction?: () => Promise<boolean>): Promise<void>
	{
		const numberOfSyncs = validationFunction ? 5 : 1;
		// If no validation function is provided, we will sync only once
		let syncValidated = !validationFunction;
		let syncCounter = 0;
		do
		{
			console.log(`Resyncing for the ${syncCounter + 1} time`);

			await this.resync(expect, expectedSyncResult);
			syncCounter++;

			if(!syncValidated)
			{
				syncValidated = await validationFunction!();
			}
		}
		while(syncCounter < numberOfSyncs && !syncValidated);

		if(!syncValidated)
		{
			throw new Error(`Sync failed to validate after ${syncCounter} attempts.`);
		}
	}

	protected validateSyncResult(syncResult: SyncResult, expect: Chai.ExpectStatic, expectedSyncResult: SyncResult = {finish: true, success: true}): void
	{
		expect(syncResult).to.not.be.undefined;
		expect(syncResult.success).to.equal(expectedSyncResult.success);
		expect(syncResult.finish).to.equal(expectedSyncResult.finish);
	}
}
