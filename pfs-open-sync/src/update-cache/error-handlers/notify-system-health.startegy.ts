import { CacheChangesInput, PapiClient } from "@pepperi-addons/papi-sdk";
import { Client } from "@pepperi-addons/debug-server/dist";

import { BaseCacheUpdateErrorHandlingStrategy } from "./base-cache-update-error-handling.strategy";


export class NotifySystemHealthStrategy extends BaseCacheUpdateErrorHandlingStrategy
{
	constructor(protected papiClient: PapiClient, protected client: Client, protected schemaName: string)
	{
		super();
	}

	protected override async internalHandle(error: Error): Promise<void>
	{
		const systemHealthNotificationBody = {
			Name:  `PFS Cache update`,
			Description: `PFS failed to update cache for schema "${this.schemaName}".`,
			Status: "ERROR",
			Message: `Failed to update cache for schema "${this.schemaName}", ActionUUID: "${this.client.ActionUUID}" with error: ${error.message}`,
			BroadcastChannel: ["System"]
		};

		try
		{
			await this.papiClient.post("/system_health/notifications", systemHealthNotificationBody);
		}
		catch (error)
		{
			// Since PFS doesn't have a dependency on system_health just try to send the error.
			if ((error as Error).message.includes("404 - Not Found error"))
			{
				console.error("Could not find system_health/notifications endpoint, this is probably because the system_health addon is not installed.");
			}
			
			console.error( error instanceof Error ? error.message : "An unknown error occurred trying to send a system_health notification.");
		}
	}
}
