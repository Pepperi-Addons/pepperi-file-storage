export abstract class BaseCacheUpdateErrorHandlingStrategy
{
	public async handle(error: Error): Promise<void>
	{
		console.error("Cache Update Error Handler: ", error);
		await this.internalHandle(error);
	}
    protected abstract internalHandle(error: Error): Promise<void>;
}
