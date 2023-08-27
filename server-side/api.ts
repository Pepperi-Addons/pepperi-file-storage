import { Client, Request } from "@pepperi-addons/debug-server";
import { PostTransactionalCommand } from "./PfsCommands/TransactionalCommands/postCommand/postTransactionalCommand";
import { RecordRemovedCommand } from "./PfsCommands/AtomicCommands/recordRemovedCommand";
import { InvalidateCommand } from "./PfsCommands/AtomicCommands/invalidateCommand";
import { HideFolderTransactionalCommand } from "./PfsCommands/TransactionalCommands/hideFolderTransactionalCommand";
import { BaseResourceFetcherService, CreateTempFileCommand, DownloadFileCommand, IFetchCommand, ListFolderContentsCommand, ListObjectsCommand, ResourceFetcherExportService, SharedHelper } from "pfs-shared";
import { ServerHelper } from "./serverHelper";
import { DIMXObject, PapiClient } from "@pepperi-addons/papi-sdk";
import { ImportResourcesCommand } from "./PfsCommands/AtomicCommands/importResourcesCommand";


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

	let pfsCommand: IFetchCommand;

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

		const resourceFetcherService = new BaseResourceFetcherService(pfsCommand);
		const res = await resourceFetcherService.fetch();

		return res;
	}
	case "POST": {
		const dal = ServerHelper.DalFactory(client, request);
		const papiClient: PapiClient = ServerHelper.createPapiClient(client, client.AddonUUID, client.AddonSecretKey);
		pfsCommand = new PostTransactionalCommand(client, papiClient, request, dal, dal);

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
		const splitResourceName = request.body.FilterAttributes.Resource.split("_");
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

export async function pfs_export(client: Client, request: Request)
{

	console.log(`Request received: ${JSON.stringify(request)}`);

	// Build a new request where the properties or on the query, so that
	// the ListObjectsCommand will be able to handle it.
	// (This request data will be internally used in a Search, not a Find.)

	request.query["where"] = request.body["Where"];
	request.query["fields"] = request.body["Fields"];
	request.query["page"] = request.body["Page"];
	request.query["page_size"] = request.body["MaxPageSize"];
	request.query["order_by"] = request.body["OrderBy"];
	request.query["include_deleted"] = request.body["IncludeDeleted"];
	request.query["resource_name"] = request.body["Resource"];
	request.query["addon_uuid"] = request.body["AddonUUID"];
	request.query["key_list"] = request.body["KeyList"];
	request.query["page_key"] = request.body["PageKey"];
	request.query["include_count"] = request.body["IncludeCount"];

	request.method = "GET";

	request.body = {};
	
	SharedHelper.validateFilesQueryParams(request);

	const dal = ServerHelper.DalFactory(client, request);

	const pfsCommand = new ListObjectsCommand(request, dal, dal);

	const resourceFetcherExport = new ResourceFetcherExportService(pfsCommand);

	const res = await resourceFetcherExport.fetch();

	return res;
}

export async function resource_import(client: Client, request: Request): Promise<{DIMXObjects: DIMXObject[]}>
{
	console.log(`Request received: ${JSON.stringify(request)}`);

	SharedHelper.validateFilesQueryParams(request);

	const dal = ServerHelper.DalFactory(client, request);

	const pfsCommand = new ImportResourcesCommand(request, dal);

	return await pfsCommand.execute();
}
