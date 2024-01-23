import { AddonData } from "@pepperi-addons/papi-sdk";
import { UpdatedObject } from "../entities";

export class UpdatedObjectsBuilder
{
	constructor()
	{ }

	public build(addonData: AddonData): UpdatedObject
	{
		const {
			Key,
			ObjectSourceSchema,
			ModificationDateTime,
			...rest
		} = addonData;

		const objectToUpdate: UpdatedObject = {
			...rest,
			ObjectModificationDateTime: ModificationDateTime!,
			Key: Key!,
		};

		return objectToUpdate;
	}
}
