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
	console.log(`On Record Removed`);

	switch (request.method) 
	{
	case "POST": {
		// The addon uuid is embbeded in the resource name: pfs_{{addon_uuid}}_{{resource_name}}.
		// Extract addon uuid from resource name:
		const splitResourceName = request.body.FilterAttributes.Resource.split('_');
		if(splitResourceName.length != 3)
		{
			// Something very strange happend...
			const errorMessage = `Invalid resource name: ${request.body.FilterAttributes.Resource}`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}

		request.query.addon_uuid = splitResourceName[1];
		request.query.resource_name = splitResourceName[2];

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
