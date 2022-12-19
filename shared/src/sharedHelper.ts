import { Request } from "@pepperi-addons/debug-server/dist";
import { v4 as uuidV4} from 'uuid'
import { PFS_TABLE_PREFIX } from "./constants";

export class SharedHelper
{
	public static validateFilesQueryParams(request: Request) 
	{
		this.validateAddonUUIDQueryParam(request);
		this.validateResourceNameQueryParam(request);
	}

	public static validateResourceNameQueryParam(request: Request) 
	{
		if(request.query?.Resource)
		{
			request.query.resource_name = request.query.Resource;
		}
		else if(request.body?.Resource)
		{
			request.query.resource_name = request.body.Resource;
		}

		if (!(request.query && request.query.resource_name)) 
		{
			throw new Error(`Missing necessary parameter: resource_name`);
		}
	}

	public static validateAddonUUIDQueryParam(request: Request) 
	{
		if(request.query?.AddonUUID)
		{
			request.query.addon_uuid = request.query.AddonUUID;
		}
		else if(request.body?.AddonUUID)
		{
			request.query.addon_uuid = request.body.AddonUUID;
		}

		if (!(request.query && request.query.addon_uuid)) 
		{
			throw new Error(`Missing necessary parameter: addon_uuid`);
		}
	}

	public static getPfsTableName(clientAddonUUID: string, schemaName: string)
	{
		// DI-21812: Migrate internal 'data' schema to names without '-' char
		// https://pepperi.atlassian.net/browse/DI-21812
		return `${PFS_TABLE_PREFIX}_${clientAddonUUID.replace(/-/g, '')}_${schemaName}`;
	}

	public static addMinusesToUUID(uuid: string): string 
	{
		const validUUID = uuid.substring(0,8)+"-"+uuid.substring(8,4)+"-"+uuid.substring(12,4)+"-"+uuid.substring(16,4)+"-"+uuid.substring(20);

		if(!uuidV4.validate(validUUID))
		{
			const errorMessage = `Passed UUID '${uuid}' is invalid.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}

		return validUUID;
	}
}