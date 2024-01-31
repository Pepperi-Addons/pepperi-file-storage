import { PapiClient } from "@pepperi-addons/papi-sdk";

import { AddonUUID as PfsAddonUUID } from "../../../../addon.config.json";
import { BaseCacheUpdateErrorHandlingStrategy } from "./base-cache-update-error-handling.strategy";
import { ModifiedObjectNotification } from "../../entities";
import { NUMBER_OF_ASYNC_RETRIES } from "./constants";

export class InitiateAsyncCacheUpdateStrategy extends BaseCacheUpdateErrorHandlingStrategy
{
	constructor(protected papiClient: PapiClient, protected pnsNotification: ModifiedObjectNotification)
	{
		super();
	}

	protected override async internalHandle(error: any): Promise<void>
	{
		// Set number of retries
		const queryParams = {
			retry: NUMBER_OF_ASYNC_RETRIES,
		};

		// Mark the async call as a non-PNS call
		this.pnsNotification.ManuallyInitiated = true;

		const asyncCall = await this.papiClient.addons.api.async().uuid(PfsAddonUUID).file("sync_source").func("update_cache").post(queryParams, this.pnsNotification);
		console.log(`Async call to update cache was initiated, ActionUUID: ${asyncCall.ExecutionUUID}`);
	}
}
