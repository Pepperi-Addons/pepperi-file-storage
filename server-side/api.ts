import PfsService from './pfs.service'
import { Client, Request } from '@pepperi-addons/debug-server'

export async function file(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);
	if(request.query.key)
	{
		request.query.Key = request.query.key;
	}

	switch (request.method) 
	{
	case "GET": {
		const pfs = new PfsService(client, request);
		return pfs.downloadFromAWS();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

export async function files(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);

	if (!(request.query && request.query.addon_uuid)) 
	{
		throw new Error(`Missing necessary parameter: addon_uuid`);
	}

	switch (request.method) 
	{
	case "GET": {
		if (request.query.folder) 
		{
			const pfs = new PfsService(client, request);
				
			return pfs.listFiles();
		}
		else 
		{
			throw new Error(`Missing necessary parameter: folder`);
		}
	}
	case "POST": {

			
		const pfs = new PfsService(client, request);
		return pfs.uploadToAWS();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}