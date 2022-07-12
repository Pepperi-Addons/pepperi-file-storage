
/*
The return object format MUST contain the field 'success':
{success:true}
If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { Client, Request } from '@pepperi-addons/debug-server'
import { AddonDataScheme, PapiClient, Relation } from '@pepperi-addons/papi-sdk';
import { LOCK_ADAL_TABLE_NAME, pfsSchemaData, PFS_TABLE_PREFIX } from './constants';
import semver from 'semver';

export async function install(client: Client, request: Request): Promise<any> 
{

	const papiClient = createPapiClient(client);
	await createLockADALTable(papiClient);
	await createDimxRelations(papiClient, client);

	return { success: true, resultObject: {} }
}

export async function uninstall(client: Client, request: Request): Promise<any> 
{
	const papiClient = createPapiClient(client);
	await papiClient.post(`/addons/data/schemes/${LOCK_ADAL_TABLE_NAME}/purge`);

	return { success: true, resultObject: {} }
}

export async function upgrade(client: Client, request: Request): Promise<any> 
{
	const papiClient = createPapiClient(client);

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.1') < 0) 
	{
		throw new Error('Upgarding from versions earlier than 1.0.1 is not supported. Please uninstall the addon and install it again.');
	}

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.4') < 0) 
	{
		// Add the new TransactionType field to the lock table schema
		await createLockADALTable(papiClient);

		// Add the new DeletedBy field to every pfs schema
		await addDeletedByFieldToPfsSchemas(papiClient);

	}

	return { success: true, resultObject: {} }
}

export async function downgrade(client: Client, request: Request): Promise<any> 
{
	return { success: true, resultObject: {} }
}

function createPapiClient(Client: Client) 
{
	return new PapiClient({
		token: Client.OAuthAccessToken,
		baseURL: Client.BaseURL,
		addonUUID: Client.AddonUUID,
		addonSecretKey: Client.AddonSecretKey,
		actionUUID: Client.ActionUUID,
	});
}

async function createLockADALTable(papiClient: PapiClient) 
{
	const pfsMetadataTable = {
		...pfsSchemaData,
		Name: LOCK_ADAL_TABLE_NAME
	}

	//Add Transaction Type field to schema
	pfsMetadataTable.Fields.TransactionType = {
		Type: 'String',
		Indexed: true,
		Keyword: true,
	};
	
	await papiClient.addons.data.schemes.post(pfsMetadataTable);
}

async function createDimxRelations(papiClient: PapiClient, client: Client) 
{
	const importRelation: Relation = {
		RelationName: "DataImportSource",
		AddonUUID: client.AddonUUID,
		Name: 'pfs',
		KeyName: "Key",
		Type: 'AddonAPI',
		AddonRelativeURL:'/data-source-api/batch'
	}

	const exportRelation: Relation = {
		RelationName: "DataExportSource",
		AddonUUID: client.AddonUUID,
		Name: 'pfs',
		Type: 'AddonAPI',
		AddonRelativeURL:'/data-source-api/pfs_export'
	}
	
	await upsertRelation(papiClient, importRelation);
	await upsertRelation(papiClient, exportRelation);
}

async function upsertRelation(papiClient: PapiClient, relation: Relation) 
{
	return papiClient.post('/addons/data/relations', relation);
}

/**
 * Add the new DeletedBy field to every pfs data schema
 */
async function addDeletedByFieldToPfsSchemas(papiClient: PapiClient) 
{
	// Get all schemas whos name starts with 'pfs_%'
	const pfsSchemas: Array<AddonDataScheme> = await papiClient.addons.data.schemes.get({ where: `Name like '${PFS_TABLE_PREFIX}_%'` });

	// Add the new DeletedBy field to every pfs schema
	for (const pfsSchema of pfsSchemas) 
	{
		//Add DeletedBy field to schema
		if(pfsSchema.Fields)
		{
			pfsSchema.Fields.DeletedBy = {
				Type: 'String',
				Indexed: true,
				Keyword: true,
			};
		}
		
		await papiClient.addons.data.schemes.post(pfsSchema);
	}
}

