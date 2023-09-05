
import { AddonFile, DIMXObject, SearchBody } from "@pepperi-addons/papi-sdk";

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
		const dimxObjects = this.request.body.DIMXObjects;
		const existingFilesMap: Map<string, AddonFile> = await this.getFileKeyToExistingFileMap();

		const batches: any[][] = this.splitObjectsToBatches(dimxObjects, this.MAX_CONCURRENCY);

		for (const batch of batches)
		{
			const batchPromises = batch.map(obj => this.importResource(obj, existingFilesMap));

			const batchResults = await Promise.allSettled(batchPromises);

			this.handleBatchResults(batchResults, batch);
		}

		return this.request.body;
	}

	/**
	 * Get a Map object where the Key is the Key of the object, and the value is the existing item
	 * @returns {Promise<Map<string, AddonFile>>} A promise that resolves to the resulting map.
	 */
	 protected async getFileKeyToExistingFileMap(): Promise<Map<string, AddonFile>>
	 {
		 const map = new Map<string, AddonFile>();
		 const adalMaxKeyListLength = 100;
 
		 const batches = this.splitObjectsToBatches(this.request.body.DIMXObjects, adalMaxKeyListLength);
		 for (const batch of batches)
		 {
			 const searchBody: SearchBody = {
				 KeyList: batch.map(obj => obj.Object.Key),
				 PageSize: batch.length,
				 IncludeDeleted: true
			 };
 
			 const searchResult = await this.pfsGetter.getObjects(searchBody);
 
			 // Add the results to the map
			 searchResult.Objects.reduce((acc, item) => acc.set(item.Key!, item), map);
		 }
 
		 return map;
	 }

	protected async importResource(obj: any, existingFilesMap: Map<string, AddonFile>) 
	{
		const existingFile: AddonFile = existingFilesMap.get(obj.Object.Key) ?? { doesFileExist: false };

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
     * Split the objects to batches of size batchSize
     * @param objects - The array to split
	 * @param batchSize - The size of each splitted batch
     * @returns An array of batches
     */
	protected splitObjectsToBatches(objects: any[], batchSize: number): any[][]
	{
		const batches: any[] = [];

		for (let i = 0; i < objects.length; i += batchSize)
		{
			const batch = objects.slice(i, i + batchSize);
			batches.push(batch);
		}

		return batches;
	}
}
