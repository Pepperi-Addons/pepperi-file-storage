export abstract class BaseCacheUpdateErrorHandler
{
	public async handle(error: any): Promise<void>
	{
		console.error("Cache Update Error Handler: ", error);
		await this.internalHandle(error);
	}
    protected abstract internalHandle(error: any): Promise<void>;
}
