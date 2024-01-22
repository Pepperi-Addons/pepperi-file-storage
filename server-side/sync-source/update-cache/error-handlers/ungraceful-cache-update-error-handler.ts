import { BaseCacheUpdateErrorHandler } from "./base-cache-update-error-handler";

export class UngracefulCacheErrorHandler extends BaseCacheUpdateErrorHandler
{
	protected override internalHandle(error: any): Promise<void>
	{
		throw error;
	}
}
