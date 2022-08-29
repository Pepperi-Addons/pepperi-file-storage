import { AbstractCommand } from './PfsCommands/abstractCommand'
import { Client, Request } from '@pepperi-addons/debug-server'
import { Helper } from './helper';
import { ListFolderContentsCommand } from './PfsCommands/AtomicCommands/listFolderContetntsCommand';
import { ListObjectsCommand } from './PfsCommands/AtomicCommands/listObjectsCommand';
import { downloadFileCommand } from './PfsCommands/AtomicCommands/downloadFileCommand';
import { RecordRemovedCommand } from './PfsCommands/AtomicCommands/recordRemovedCommand';
import { InvalidateCommand } from './PfsCommands/AtomicCommands/invalidateCommand';
import { UnlockTransactionsCommand } from './PfsCommands/AtomicCommands/unlockTransactionsCommand';
import { AsyncHideFolderTransactionalCommand } from './PfsCommands/TransactionalCommands/asyncHideFolderTransactionalCommand';
import { TransactionalCommandExecutor } from './PfsCommands/TransactionalCommands/transactionalCommandExecutor';

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
		const pfsCommand = new downloadFileCommand(client, request, dal, dal);

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

	Helper.validateFilesQueryParams(request);

	let pfsCommand: AbstractCommand;

	switch (request.method) 
	{
	case "GET": {
		const dal = Helper.DalFactory(client, request);
		
		if (request.query.folder) 
		{				
			pfsCommand = new ListFolderContentsCommand(client, request, dal, dal);
		}
		else 
		{
			pfsCommand = new ListObjectsCommand(client, request, dal, dal);
		}

		return pfsCommand.execute();
	}
	case "POST": {
		const dal = Helper.DalFactory(client, request);
		// pfsCommand = new PostTransactionalCommand(client, request, dal, dal);
		pfsCommand = new TransactionalCommandExecutor(client, request, dal, dal);

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
		Helper.validateFilesQueryParams(request);


		const dal = Helper.DalFactory(client, request);
		const pfsCommand = new InvalidateCommand(client, request, dal, dal);

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
		Helper.validateFilesQueryParams(request);

		const dal = Helper.DalFactory(client, request);
		const pfsCommand = new AsyncHideFolderTransactionalCommand(client, request, dal, dal);

		return await pfsCommand.execute();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}

export async function unlock_transactions(client: Client, request: Request) 
{
	console.log(`Request received: ${JSON.stringify(request)}`);

	if(!Helper.isSupportAdminUser(client))
	{
		throw new Error(`Only admin users are allowed to unlock transactions`);
	}

	let pfsCommand: AbstractCommand;

	switch (request.method) 
	{
	case "POST": {
		const dal = Helper.DalFactory(client, request);
		pfsCommand = new UnlockTransactionsCommand(client, request, dal, dal);

		return pfsCommand.execute();
	}
	default: {
		throw new Error(`Unsupported method: ${request.method}`);
	}
	}
}
