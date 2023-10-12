import { AddonDataScheme } from "@pepperi-addons/papi-sdk";

import { ABaseOfflinePfsTests } from "./aBaseOfflinePfsTests.test";


export class GenericOfflineTests extends ABaseOfflinePfsTests
{
	title = "Generic Offline tests";

	tests(describe: (suiteTitle: string, func: () => void) => void,
		it: (name: string, fn: Mocha.Func) => void,
		expect: Chai.ExpectStatic,
	): void 
	{
		describe(this.title, async () => 
		{
			

			it("Create an empty schema online and sync it", async () => 
			{
				await this.ensureSchemaDoesntExist(expect);

				// Create a PFS schema online
				await this.createPfsSchema();

				// Sync it
				await this.resync(expect,{finish: true, success: true});
				// Make sure it is synced
				const offlineSchema = await this.pfsOfflineService.getSchema(this.pfsSchemaName);

				expect(offlineSchema).to.not.be.undefined;
				expect(offlineSchema.Name).to.equal(this.pfsSchemaName);
			});
		});
	}

	/**
	 * If the schema exists, purges it, and waits for any PNS notifications to resolve.
	 * @returns {Promise<void>}
	 */
	protected async ensureSchemaDoesntExist(expect: Chai.ExpectStatic): Promise<void>
	{
		let existingSchema: AddonDataScheme | undefined;
		try 
		{
			existingSchema = await this.pfsOnlineService.getSchema(this.pfsSchemaName);
		}
		catch (err) 
		{
			// Schema not found
		}

		if (existingSchema) 
		{
			await this.pfsOnlineService.purgeSchema(this.pfsSchemaName);
			// Await any PNS notifications to resolve.
			this.waitForAsyncJob();

			// Sync the purging of the schema to the device
			await this.syncWithValidation(expect, {finish: true, success: true}, async () => 
			{
				let res: boolean;
				try 
				{
					await this.pfsOnlineService.getSchema(this.pfsSchemaName);
					// Succeeding in getting the schema means it wasn't purged
					res = false;
				}
				catch (error) 
				{
					res = true;
				}

				return res;
			});
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
				PushLocalChanges: true
			},
			Type: "pfs",
		};

		return await this.pfsOnlineService.createSchema(schema);
	}
}
