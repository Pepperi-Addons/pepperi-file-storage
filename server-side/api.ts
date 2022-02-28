import { PfsService } from './pfs.service'
import { Client, Request } from '@pepperi-addons/debug-server'
import { IndexedDataS3PfsDal } from './DAL/IndexedDataS3PfsDal';

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
		const dal = getDalInstance(client, request);
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

	switch (request.method) 
	{
	case "GET": {
		if (request.query.folder) 
		{
			const dal = getDalInstance(client, request);
			const pfs = new PfsService(client, request, dal, dal);
				
			return pfs.listFiles();
		}
		else 
		{
			throw new Error(`Missing necessary parameter: folder`);
		}
	}
	case "POST": {
		const dal = getDalInstance(client, request);
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
		const dal = getDalInstance(client, request);
		const pfs = new PfsService(client, request, dal, dal);

		return await pfs.recordRemoved();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

function getDalInstance(client: Client, request: Request) 
{
	return new IndexedDataS3PfsDal(client, request);
}