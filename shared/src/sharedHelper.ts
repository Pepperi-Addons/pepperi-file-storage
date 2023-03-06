import { Request } from "@pepperi-addons/debug-server/dist";
import { validate as uuidValidate } from 'uuid';
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
		const validUUID = `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;

		if(!uuidValidate(validUUID))
		{
			const errorMessage = `Passed UUID '${uuid}' is invalid.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}

		return validUUID;
	}
}