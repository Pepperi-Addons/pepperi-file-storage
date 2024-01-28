import { Client } from "@pepperi-addons/debug-server/dist";

import { IModifiedObjects, ModifiedObjectNotification } from "../../entities";
import { BaseCacheUpdateErrorHandler } from "./base-cache-update-error-handler";
import { UngracefulCacheErrorHandler } from "./ungraceful-cache-update-error-handler";
import { PnsAsyncCacheErrorHandler } from "./pns-async-cache-update-error-handler";
import { NUMBER_OF_ASYNC_RETRIES } from "./constants";
import { AsyncNoRetriesCacheErrorHandler } from "./async-no-retries-cache-update-error-handler";
import { PapiClientBuilder } from "../..";
import { AddonUUID as PfsAddonUUID } from "../../../../addon.config.json";


export class CacheUpdateErrorHandlerFactory 
{
	create(client: Client, modifiedObjects: IModifiedObjects, pnsNotification: ModifiedObjectNotification): BaseCacheUpdateErrorHandler
	{
		let errorHandler: BaseCacheUpdateErrorHandler;

		const isAsync = client.isAsync ? client.isAsync() : false;
		const isManuallyInitiatedAsyncCall = (isAsync && pnsNotification.ManuallyInitiated);


		if(isAsync)
		{
			if(isManuallyInitiatedAsyncCall)
			{
				if(client.NumberOfTry! < NUMBER_OF_ASYNC_RETRIES)
				{
					errorHandler = new UngracefulCacheErrorHandler();
				}
				else
				{
					const papiClientBuilder = new PapiClientBuilder();
					const papiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey);

					errorHandler = new AsyncNoRetriesCacheErrorHandler(papiClient, client, modifiedObjects);
				}
			}
			else
			{
				const papiClientBuilder = new PapiClientBuilder();
        
				const shouldKeepActionUUID = false;
				const asyncPapiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey, shouldKeepActionUUID);

				errorHandler = new PnsAsyncCacheErrorHandler(asyncPapiClient, pnsNotification);
			}
		}
		else
		{
			errorHandler = new UngracefulCacheErrorHandler();
		}

		return errorHandler;
	}
}
