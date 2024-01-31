import { BaseCacheUpdateErrorHandlingStrategy } from "./base-cache-update-error-handling.strategy";

export class InvokeRetryStrategy extends BaseCacheUpdateErrorHandlingStrategy
{
	protected override internalHandle(error: Error): Promise<void>
	{
		// A retry will be invoked by the PNS or Async addon upon receiving this error.
		throw error;
	}
}
