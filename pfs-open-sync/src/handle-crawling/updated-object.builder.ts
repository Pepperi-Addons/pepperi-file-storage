import { AddonData, CacheObject } from "@pepperi-addons/papi-sdk";

export class UpdatedObjectsBuilder
{
	constructor()
	{ }

	public build(addonData: AddonData): CacheObject
	{
		const {
			Key,
			ObjectSourceSchema,
			ModificationDateTime,
			...rest
		} = addonData;

		const objectToUpdate: CacheObject = {
			...rest,
			ObjectModificationDateTime: ModificationDateTime!,
			Key: Key!,
		};

		return objectToUpdate;
	}
}
