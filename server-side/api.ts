import { Client, Request } from '@pepperi-addons/debug-server'
import { PostTransactionalCommand } from './PfsCommands/TransactionalCommands/postTransactionalCommand';
import { RecordRemovedCommand } from './PfsCommands/AtomicCommands/recordRemovedCommand';
import { InvalidateCommand } from './PfsCommands/AtomicCommands/invalidateCommand';
import { HideFolderTransactionalCommand } from './PfsCommands/TransactionalCommands/hideFolderTransactionalCommand';
import { CreateTempFileCommand, DownloadFileCommand, ICommand, ListFolderContentsCommand, ListObjectsCommand, SharedHelper } from 'pfs-shared';
import { ServerHelper } from './serverHelper';

export async function file(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);
	if(request.query.key)
	{
		request.query.Key = request.query.key;
	}

	SharedHelper.validateResourceNameQueryParam(request);

	switch (request.method) 
	{
	case "GET": {
		const dal = ServerHelper.DalFactory(client, request);
		const pfsCommand = new DownloadFileCommand(request, dal, dal);

		return pfsCommand.execute();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

export async function files(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);

	SharedHelper.validateFilesQueryParams(request);

	let pfsCommand: ICommand;

	switch (request.method) 
	{
	case "GET": {
		const dal = ServerHelper.DalFactory(client, request);
		
		if (request.query.folder) 
		{				
			pfsCommand = new ListFolderContentsCommand(request, dal, dal);
		}
		else 
		{
			pfsCommand = new ListObjectsCommand(request, dal, dal);
		}

		return pfsCommand.execute();
	}
	case "POST": {
		const dal = ServerHelper.DalFactory(client, request);
		pfsCommand = new PostTransactionalCommand(client, request, dal, dal);

		return pfsCommand.execute();
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
		// The addon uuid is embedded in the resource name: pfs_{{addon_uuid}}_{{resource_name}}. (addon_uuid is without dashes)
		// Extract addon uuid from resource name:
		const splitResourceName = request.body.FilterAttributes.Resource.split('_');
		if(splitResourceName.length != 3)
		{
			// Something very strange happened...
			const errorMessage = `Invalid resource name: ${request.body.FilterAttributes.Resource}`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}

		request.query.addon_uuid = SharedHelper.addMinusesToUUID(splitResourceName[1]);
		request.query.resource_name = splitResourceName[2];

		const dal = ServerHelper.DalFactory(client, request);
		const pfsCommand = new RecordRemovedCommand(client, request, dal, dal);

		return await pfsCommand.execute();
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
		SharedHelper.validateFilesQueryParams(request);


		const dal = ServerHelper.DalFactory(client, request);
		const pfsCommand = new InvalidateCommand(client, request, dal, dal);

		return await pfsCommand.execute();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

export async function temporary_file(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);

	switch (request.method) 
	{
	case "POST": {
		SharedHelper.validateTemporaryFileParams(request);


		const dal = ServerHelper.DalFactory(client, request);
		const pfsCommand = new CreateTempFileCommand(client.OAuthAccessToken, request, dal, dal);

		return await pfsCommand.execute();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

export async function hide_folder(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);

	switch (request.method) 
	{
	case "POST": {
		SharedHelper.validateFilesQueryParams(request);

		const dal = ServerHelper.DalFactory(client, request);
		const pfsCommand = new HideFolderTransactionalCommand(client, request, dal, dal);

		return await pfsCommand.execute();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}
