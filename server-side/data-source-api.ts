import { Client, Request } from '@pepperi-addons/debug-server';
import { Helper } from './helper';
import { PfsSchemeService } from './pfs-scheme.service';
export { files, file } from './api';
import { files } from './api';

export async function create(client: Client, request: Request) 
{
	switch (request.method) 
	{
	case "POST": {
		const pfsSchemeService = new PfsSchemeService(client, request);
		return await pfsSchemeService.create();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

export async function batch(client: Client, request: Request) 
{
	Helper.validateFilesQueryParams(request);
	switch (request.method) 
	{
	case "POST": {

		return naiveBatch(client, request);
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

async function naiveBatch(client: Client, request: Request) 
{

	const promiseResults = await Promise.allSettled(request.body.Objects.map(obj => (async () => 
	{
		// Build a request, keeping the original request's headers etc.
		const objRequest = {...request};
		// Set obj's content as body
		objRequest.body = obj;
		return files(client, objRequest);
	})()));

	const dimxObjects: any[] =[];
	for (const i in promiseResults) 
	{
		const resDimxObj: any = {
			Key: request.body.Objects[i].Key,
		}

		const promiseResult = promiseResults[i];

		if(promiseResult.status === 'fulfilled')
		{
			// Set status to Update just so we have a value.
			// Real treatment will be done in the full implementation.
			resDimxObj.Status = 'Update';
			resDimxObj.PresignedURL = promiseResult.value.PresignedURL;
		}
		else
		{
			resDimxObj.Status = 'Error';
			resDimxObj.Details = promiseResult.reason.message;
		}

		dimxObjects.push(resDimxObj);
	}

	return dimxObjects;
}

export async function purge(client: Client, request: Request) 
{
	switch (request.method) 
	{
	case "POST": {
		const pfsSchemeService = new PfsSchemeService(client, request);
		return await pfsSchemeService.purge();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}