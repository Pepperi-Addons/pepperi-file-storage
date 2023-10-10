import { BaseTest } from "@pepperi-addons/addon-testing-framework";
import { PapiClient } from "@pepperi-addons/papi-sdk";

import { FilesFetcherService } from "./services/filesFetcher.service";
import { PfsOfflineService } from "./services/pfsOffline.service";
import { PfsOnlineService } from "./services/pfsOnline.service";

export abstract class ABasePfsTests extends BaseTest
{
	private _pfsOnlineService: PfsOnlineService | undefined;
	private _pfsOfflineService: PfsOfflineService | undefined;
	private _papiClient: PapiClient | undefined;	
	private _filesFetcherService: FilesFetcherService | undefined;

	protected get pfsOnlineService(): PfsOnlineService
	{
		if(!this._pfsOnlineService)
		{
			this._pfsOnlineService = new PfsOnlineService(this.papiClient);
		}

		return this._pfsOnlineService;
	}

	protected get pfsOfflineService(): PfsOfflineService
	{
		if(!this._pfsOfflineService)
		{
			this._pfsOfflineService = new PfsOfflineService(this.container);
		}

		return this._pfsOfflineService;
	}

	protected get papiClient(): PapiClient
	{
		if(!this._papiClient)
		{
			this._papiClient = new PapiClient({
				baseURL: this.container.client.BaseURL,
				token: this.container.client.OAuthAccessToken,
				addonUUID: this.container.client.AddonUUID,
				addonSecretKey: this.container.client.AddonSecretKey,
				actionUUID: this.container.client.ActionUUID,
			});
		}

		return this._papiClient;
	}

	protected get filesFetcherService(): FilesFetcherService
	{
		if(!this._filesFetcherService)
		{
			this._filesFetcherService = new FilesFetcherService(this.container);
		}

		return this._filesFetcherService;
	}

	/**
	 * Sleeps for the specified number of seconds
	 * @param seconds - number of seconds to wait for the async job to finish. Default is 30 seconds.
	 */
	 protected async waitForAsyncJob(seconds: number = 30, message: string = ""): Promise<void> 
	 {
		if(message)
		{
			console.log(message);
		} 
		console.log(`Waiting for ${seconds} seconds for operation to catch up...`);
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
		console.log(`Done waiting for operation`);
	 }
}
