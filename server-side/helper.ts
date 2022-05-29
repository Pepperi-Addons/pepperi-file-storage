import { Client, Request } from "@pepperi-addons/debug-server/dist";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { DEBUG_MAXIMAL_LOCK_TIME, MAXIMAL_LOCK_TIME } from "./constants";
import { IndexedDataS3PfsDal } from "./DAL/IndexedDataS3PfsDal";
import { FailAfterLock, FailAfterMutatingAdal, FailAfterMutatingS3 } from "./DAL/TestLockMechanism";

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

		if (!lowerCaseHeaders["x-pepperi-secretkey"] || !await this.isValidRequestedAddon(client, lowerCaseHeaders["x-pepperi-secretkey"], addonUUID)) 
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

	public static createPapiClient(client: Client, addonUUID: any, secretKey: any = '') 
	{
		return new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: addonUUID,
			actionUUID: client.ActionUUID,
			addonSecretKey: secretKey
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
}