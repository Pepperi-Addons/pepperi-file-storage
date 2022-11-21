import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { DEBUG_MAXIMAL_LOCK_TIME, DIMX_ADDON_UUID, MAXIMAL_LOCK_TIME, PFS_TABLE_PREFIX } from "./constants";
import { IndexedDataS3PfsDal } from "./DAL/IndexedDataS3PfsDal";
import { FailAfterLock, FailAfterMutatingAdal, FailAfterMutatingS3 } from "./DAL/TestLockMechanism";
import { v4 as uuidV4} from 'uuid'

export class Helper
{
	public static DalFactory(client: Client, request: Request) 
	{
		if(!request.query)
		{
			request.query = {};
		}

		switch(request.query.testing_transaction)
		{
		//**** Testing scenarios ****//

		case "stop_after_lock":{
			return new FailAfterLock(client, request, DEBUG_MAXIMAL_LOCK_TIME);
		}
		case "stop_after_S3":{
			return new FailAfterMutatingS3(client, request, DEBUG_MAXIMAL_LOCK_TIME);
		}
		case "stop_after_ADAL":{
			return new FailAfterMutatingAdal(client, request, DEBUG_MAXIMAL_LOCK_TIME);
		}

		//**** End of testing scenarios ****//

		default:{
			return new IndexedDataS3PfsDal(client, request, request.query.testRollback ? 0 : MAXIMAL_LOCK_TIME);
		}
		}
	}

	public static async validateAddonSecretKey(header: any, client: Client, addonUUID:string) 
	{
		const lowerCaseHeaders = Helper.getLowerCaseHeaders(header);

		if (!lowerCaseHeaders["x-pepperi-secretkey"] || !(
			await this.isValidRequestedAddon(client, lowerCaseHeaders["x-pepperi-secretkey"], addonUUID) || // Given secret key doesn't match the client addon's.
			await this.isValidRequestedAddon(client, lowerCaseHeaders["x-pepperi-secretkey"], DIMX_ADDON_UUID) // Given secret key doesn't match the DIMX's.
		)) 
		{
			const err: any = new Error(`Authorization request denied. ${lowerCaseHeaders["x-pepperi-secretkey"]? "check secret key" : "Missing secret key header"} `);
			err.code = 401;
			throw err;
		}
	}

	public static getLowerCaseHeaders(header: any) 
	{
		const lowerCaseHeaders = {};
		for (const [key, value] of Object.entries(header)) 
		{
			lowerCaseHeaders[key.toLowerCase()] = value;
		}
		return lowerCaseHeaders;
	}

	private static async isValidRequestedAddon(client: Client, secretKey, addonUUID)
	{
		const papiClient = Helper.createPapiClient(client, addonUUID, secretKey);

		try
		{
			const res = await papiClient.get(`/var/sk/addons/${addonUUID}/validate`);
			return true;
		}
		catch (err) 
		{
			if (err instanceof Error) 
			{
				console.error(`${err.message}`);
			}
			return false;
		}
	}

	public static createPapiClient(client: Client, addonUUID: string, secretKey = '') 
	{
		return new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: addonUUID,
			actionUUID: client.ActionUUID,
			...(secretKey && {addonSecretKey: secretKey})
		});
	}
	
	/**
	 * Returns an array with arrays of the requested chunk size.
	 *
	 * @param arr {Array} array to split
	 * @param chunk_size {number} Size of every group
	 */
	public static chunkArray<Type>(arr: Array<Type>, chunk_size: number): Array<Array<Type>>
	{
		let index = 0;
		const arrayLength = arr.length;
		const resArray: Array<any> = [];
		
		for (index = 0; index < arrayLength; index += chunk_size) 
		{
			const chunk = arr.slice(index, index + chunk_size);
			resArray.push(chunk);
		}

		return resArray;
	}

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