import { PfsService } from './pfs.service'
import { Client, Request } from '@pepperi-addons/debug-server'
import { Helper } from './helper';

export async function file(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);
	if(request.query.key)
	{
		request.query.Key = request.query.key;
	}

	if (!(request.query && request.query.resource_name)) 
	{
		throw new Error(`Missing necessary parameter: resource_name`);
	}

	switch (request.method) 
	{
	case "GET": {
		const dal = Helper.DalFactory(client, request);
		const pfs = new PfsService(client, request, dal, dal);

		return pfs.downloadFile();
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

	if (!(request.query && request.query.resource_name)) 
	{
		throw new Error(`Missing necessary parameter: resource_name`);
	}

	switch (request.method) 
	{
	case "GET": {
		if (request.query.folder) 
		{
			const dal = Helper.DalFactory(client, request);
			const pfs = new PfsService(client, request, dal, dal);
				
			return pfs.listFiles();
		}
		else 
		{
			throw new Error(`Missing necessary parameter: folder`);
		}
	}
	case "POST": {
		const dal = Helper.DalFactory(client, request);
		const pfs = new PfsService(client, request, dal, dal);

		return pfs.uploadFile();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

export async function record_removed(client: Client, request: Request) 
{
	console.log(`On Record Removed. received: ${JSON.stringify(request)}`);

	switch (request.method) 
	{
	case "POST": {
		request.query.addon_uuid = request.body.FilterAttributes.AddonUUID;
		request.query.resource_name = request.body.FilterAttributes.Resource;

		const dal = Helper.DalFactory(client, request);
		const pfs = new PfsService(client, request, dal, dal);

		return await pfs.recordRemoved();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}
