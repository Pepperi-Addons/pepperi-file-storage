import { PapiClient } from "@pepperi-addons/papi-sdk";
import { Client } from "@pepperi-addons/debug-server/dist";

import { BaseCacheUpdateErrorHandler } from "./base-cache-update-error-handler";
import { IModifiedObjects } from "../../entities";


export class AsyncNoRetriesCacheErrorHandler extends BaseCacheUpdateErrorHandler
{
	constructor(protected papiClient: PapiClient, protected client: Client, protected modifiedObjects: IModifiedObjects)
	{
		super();
	}

	protected override async internalHandle(error: any): Promise<void>
	{
		await this.setSystemHealthNotification(error.message);
	}

	protected async setSystemHealthNotification(message: string): Promise<void>
	{
		const systemHealthNotificationBody = {
			Name:  `PFS Cache update`,
			Description: `PFS failed to update cache for schema "${this.modifiedObjects.SchemeName}".`,
			Status: "ERROR",
			Message: `Failed to update cache for schema "${this.modifiedObjects.SchemeName}", ActionUUID: "${this.client.ActionUUID}" with error: ${message}`,
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
