import { Client } from "@pepperi-addons/debug-server/dist";

import { ModifiedObjectNotification } from "../../entities";
import { BaseCacheUpdateErrorHandlingStrategy } from "./base-cache-update-error-handling.strategy";
import { InvokeRetryStrategy } from "./invoke-retry.strategy";
import { InitiateAsyncCacheUpdateStrategy } from "./initiate-async-cache-update.strategy.ts";
import { NUMBER_OF_ASYNC_RETRIES } from "./constants";
import { NotifySystemHealthStrategy } from "./notify-system-health.startegy";
import { PapiClientBuilder } from "../..";
import { AddonUUID as PfsAddonUUID } from "../../../../addon.config.json";


export class CacheUpdateErrorHandlingStrategyFactory 
{
	create(client: Client, pnsNotification: ModifiedObjectNotification): BaseCacheUpdateErrorHandlingStrategy
	{
		let errorHandlingStrategy: BaseCacheUpdateErrorHandlingStrategy;

		const isSynchronousCall = client.isAsync ? !client.isAsync() : true;
		const isAsyncCallFromPns = (!isSynchronousCall && !pnsNotification.ManuallyInitiated);

		if(isSynchronousCall)
		{
			errorHandlingStrategy = new InvokeRetryStrategy();
		}
		else if(isAsyncCallFromPns)
		{
			errorHandlingStrategy = this.getInitiateAsyncCacheUpdateStrategy(client, pnsNotification);
		}
		else // This is an async call that was initiated manually
		{
			const asyncRetriesLeft = client.NumberOfTry! < NUMBER_OF_ASYNC_RETRIES;
			if(asyncRetriesLeft)
			{
				errorHandlingStrategy = new InvokeRetryStrategy();
			}
			else
			{
				errorHandlingStrategy = this.getNotifySystemHealthStrategy(client, pnsNotification.FilterAttributes.Resource);
			}
		}

		return errorHandlingStrategy;
	}

	protected getInitiateAsyncCacheUpdateStrategy(client: Client, pnsNotification: ModifiedObjectNotification): InitiateAsyncCacheUpdateStrategy
	{
		const papiClientBuilder = new PapiClientBuilder();
		const asyncPapiClient = papiClientBuilder.buildWithoutActionUUID(client, PfsAddonUUID, client.AddonSecretKey);

		return new InitiateAsyncCacheUpdateStrategy(asyncPapiClient, pnsNotification);
	}

	protected getNotifySystemHealthStrategy(client: Client, schemaName: string): NotifySystemHealthStrategy
	{
		const papiClientBuilder = new PapiClientBuilder();
		const papiClient = papiClientBuilder.build(client, PfsAddonUUID, client.AddonSecretKey);

		return new NotifySystemHealthStrategy(papiClient, client, schemaName);
	}
}
