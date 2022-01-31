import PfsService from './pfs.service'
import { Client, Request } from '@pepperi-addons/debug-server'

export async function file(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);
	if(request.query.key){
		request.query.Key = request.query.key;
	}
	
	// Handle nginx mapping issues
	if(request.query.addon_uuid.indexOf('/') !== -1)
	{
		console.log(`Key before handeling: ${request.query.Key}. Addon_uuid before handeling: ${request.query.addon_uuid}`);
		request.query.Key = `${request.query.addon_uuid.substring(request.query.addon_uuid.indexOf('/') + 1, request.query.addon_uuid.length)}/${request.query.key}`;
		request.query.addon_uuid = request.query.addon_uuid.substring(0, request.query.addon_uuid.indexOf('/'));
		console.log(`Key after handeling: ${request.query.Key}. Addon_uuid after handeling: ${request.query.addon_uuid}`);
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

	// Handle nginx mapping issues
	request.query.addon_uuid = request.query.addon_uuid.startsWith('/') ? request.query.addon_uuid.substring(1) : request.query.addon_uuid;

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