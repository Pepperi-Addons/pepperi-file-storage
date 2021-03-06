import { AWS_MAX_DELETE_OBJECTS_NUMBER } from '../../constants';
import { Helper } from '../../helper';
import AbstractCommand from '../abstractCommand';

export class RecordRemovedCommand extends AbstractCommand 
{

	public async execute(): Promise<any>{
		return await this.recordRemoved();
	}

	private async recordRemoved() 
	{
		// Get a list of the removed keys.
		const removedKeys: string[] = this.request.body.Message.ModifiedObjects.map(modifiedObject => modifiedObject.ObjectKey);

		// S3's DeleteObjects supports requests with up to 1000 objects.
		// Break array to smaller arrays with size up to 1000.
		const arrayOfArraysInSizeForDelete: string[][] = Helper.chunkArray(removedKeys, AWS_MAX_DELETE_OBJECTS_NUMBER);

		// Create a promise for each array, and await for all of them to settle.
		return await Promise.allSettled(arrayOfArraysInSizeForDelete.map(keys => (async () => 
		{
			await this.pfsMutator.batchDeleteS3(keys);
		})()));
	}
}
