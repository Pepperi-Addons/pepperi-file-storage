
import { AddonFile, DIMXObject } from "@pepperi-addons/papi-sdk";

import { ICommand, PfsService } from "pfs-shared";


export class ImportResourcesCommand extends PfsService implements ICommand 
{
	protected readonly MAX_CONCURRENCY = 5;

	public async execute(): Promise<any>
	{
		return await this.importResources();
	}

	/**
     * Import the resources, handling a maximum of this.MAX_CONCURRENCY at a time.
     * The implementation only handles S3 operations, and does not handle ADAL operations,
     * or any other validation or manipulation of the imported objects.
     * 
     * @returns {Promise<{DIMXObjects: DIMXObject[]}>} - The imported objects
     */
	protected async importResources(): Promise<{DIMXObjects: DIMXObject[]}>
	{
		const existingFile = {};
		const dimxObjects = this.request.body.DIMXObjects;

		const batches: any[][] = this.splitObjectsToBatches(dimxObjects);

		for (const batch of batches)
		{
			const batchPromises = batch.map(obj => this.importResource(obj));

			const batchResults = await Promise.allSettled(batchPromises);

			this.handleBatchResults(batchResults, batch);
		}

		return this.request.body;
	}

	private async importResource(obj: any) 
	{
		let existingFile: AddonFile;
		try
		{
			existingFile = await this.downloadFile(obj.Object.Key);
		}
		catch (error)
		{
			existingFile = { doesFileExist: false };
		}

		await this.pfsMutator.mutateS3(obj.Object, existingFile);
	}

	/**
     * Handle the results of a batch
     * If a promise was rejected, mark the object as failed
     * @param {PromiseSettledResult<any>[]} batchResults - The results of the batch
     * @param {any[]} batchObjects - The objects of the batch
     */
	protected handleBatchResults(batchResults: PromiseSettledResult<any>[], batchObjects: any[]): void
	{
		batchResults.forEach((result, index) => 
		{
			if (result.status === "rejected") 
			{
				const errorDetails = `PFS Resource Import: Error handling object ${batchObjects[index].Object.Key}: ${result.reason}`;
				console.error(errorDetails);
				batchObjects[index].Status = "Error";
				batchObjects[index].Details = errorDetails;
			}
		});
	}

	/**
     * Split the objects to batches of size this.MAX_CONCURRENCY
     * @param dimxObjects - The array to split
     * @returns An array of batches
     */
	protected splitObjectsToBatches(dimxObjects: any[]): any[][]
	{
		const batches: any[] = [];

		for (let i = 0; i < dimxObjects.length; i += this.MAX_CONCURRENCY)
		{
			const batch = dimxObjects.slice(i, i + this.MAX_CONCURRENCY);
			batches.push(batch);
		}

		return batches;
	}
}
