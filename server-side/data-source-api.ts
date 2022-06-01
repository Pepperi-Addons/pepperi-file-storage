import { Client, Request } from '@pepperi-addons/debug-server';
import { PfsSchemeService } from './pfs-scheme.service';
export { files, file } from './api';

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