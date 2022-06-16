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

	Helper.validateResourceNameQueryParam(request);

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

	Helper.validateFilesQueryParams(request);

	switch (request.method) 
	{
	case "GET": {
		const dal = Helper.DalFactory(client, request);
		const pfs = new PfsService(client, request, dal, dal);

		if (request.query.folder) 
		{				
			return pfs.listFolderContent();
		}
		else 
		{
			return pfs.listObjects();
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

export async function invalidate(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);

	switch (request.method) 
	{
	case "POST": {
		Helper.validateFilesQueryParams(request);


		const dal = Helper.DalFactory(client, request);
		const pfs = new PfsService(client, request, dal, dal);

		return await pfs.invalidate();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}
