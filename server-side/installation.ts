
/*
The return object format MUST contain the field 'success':
{success:true}
If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { Client, Request } from '@pepperi-addons/debug-server'
import { AddonDataScheme, FindOptions, PapiClient, Relation } from '@pepperi-addons/papi-sdk';
import { LOCK_ADAL_TABLE_NAME, pfsSchemaData, PFS_TABLE_PREFIX } from './constants';
import semver from 'semver';
import { PfsSchemeService } from './pfs-scheme.service';

export async function install(client: Client, request: Request): Promise<any> {

	const papiClient = createPapiClient(client);
	await createLockADALTable(papiClient);
	await createDimxRelations(papiClient, client);

	return { success: true, resultObject: {} }
}

export async function uninstall(client: Client, request: Request): Promise<any> {
	const papiClient = createPapiClient(client);
	await papiClient.post(`/addons/data/schemes/${LOCK_ADAL_TABLE_NAME}/purge`);

	return { success: true, resultObject: {} }
}

export async function upgrade(client: Client, request: Request): Promise<any> {
	const papiClient = createPapiClient(client);

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.1') < 0) {
		throw new Error('Upgarding from versions earlier than 1.0.1 is not supported. Please uninstall the addon and install it again.');
	}

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.4') < 0) {
		// Add the new TransactionType field to the lock table schema
		await createLockADALTable(papiClient);

		// Add the new DeletedBy field to every pfs schema
		await addDeletedByFieldToPfsSchemas(papiClient);

	}

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.8') < 0) {
		await addTrailingSlashToFolderProperty(papiClient, client);
	}

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.27') < 0) {
		console.log("Updating \"Name\" field on all schemas");
		await updateNameField(papiClient);
	}

	return { success: true, resultObject: {} }
}

export async function downgrade(client: Client, request: Request): Promise<any> {
	return { success: true, resultObject: {} }
}

function createPapiClient(Client: Client) {
	return new PapiClient({
		token: Client.OAuthAccessToken,
		baseURL: Client.BaseURL,
		addonUUID: Client.AddonUUID,
		addonSecretKey: Client.AddonSecretKey,
		actionUUID: Client.ActionUUID,
	});
}

async function createLockADALTable(papiClient: PapiClient) {
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

async function createDimxRelations(papiClient: PapiClient, client: Client) {
	const importRelation: Relation = {
		RelationName: "DataImportSource",
		AddonUUID: client.AddonUUID,
		Name: 'pfs',
		KeyName: "Key",
		Type: 'AddonAPI',
		AddonRelativeURL: '/data-source-api/batch'
	}

	const exportRelation: Relation = {
		RelationName: "DataExportSource",
		AddonUUID: client.AddonUUID,
		Name: 'pfs',
		Type: 'AddonAPI',
		AddonRelativeURL: '/data-source-api/pfs_export'
	}

	await upsertRelation(papiClient, importRelation);
	await upsertRelation(papiClient, exportRelation);
}

async function upsertRelation(papiClient: PapiClient, relation: Relation) {
	return papiClient.post('/addons/data/relations', relation);
}

/**
 * Add the new DeletedBy field to every pfs data schema
 */
async function addDeletedByFieldToPfsSchemas(papiClient: PapiClient) {
	const manipulatorFunction = async (schema: AddonDataScheme) : Promise<void> => {
		if (schema.Fields) {
			schema.Fields.DeletedBy = {
				Type: 'String',
				Indexed: true,
				Keyword: true,
			};

			await papiClient.addons.data.schemes.post(schema);
		}
	}

	await manipulateAllPfsSchemas(papiClient, manipulatorFunction);
}

export async function updateNameField(papiClient: PapiClient) {
	const manipulatorFunction = async (schema: AddonDataScheme) : Promise<void> => {
		if (schema.Fields  && !schema.Fields.Name?.Indexed) {

			console.log('Setting Name field Indexed=true...');
			schema.Fields.Name =
			{
				Type: 'String',
				Indexed: true,
			};

			await papiClient.addons.data.schemes.post(schema);
			console.log('Done setting Name field Indexed=true.');

			console.log(`Rebuilding (clean) schema: '${schema.Name}'...`);
			const rebuildResponse = await papiClient.post(`/addons/api/async/00000000-0000-0000-0000-00000000ada1/indexed_adal_api/clean_rebuild?table_name=${schema.Name}`);
			console.log(`Rebuild response: ${JSON.stringify(rebuildResponse)}`);
		}
	}

	await manipulateAllPfsSchemas(papiClient, manipulatorFunction);
}

async function manipulateAllPfsSchemas(papiClient: PapiClient, manipulatorFunction: (schema: AddonDataScheme) => Promise<void>)
{
	// Get all schemas whos name starts with 'pfs_%'
	console.log('Getting all pfs_ schemas...');
	const pfsSchemas: Array<AddonDataScheme> = await papiClient.addons.data.schemes.get({ where: `Name like '${PFS_TABLE_PREFIX}_%'` });

	console.log('Done getting all pfs_ schemas.');

	for (const pfsSchema of pfsSchemas)
	{
		console.log(`Executing manipulation on schema '${pfsSchema.Name}'...`);
		await manipulatorFunction(pfsSchema);

		console.log(`Done manipulating schema '${pfsSchema.Name}'.`);
	}
}

export async function addTrailingSlashToFolderProperty(papiClient: PapiClient, client: Client) {
	// Get all pfs schemas
	const pfsSchemas: Array<AddonDataScheme> = await papiClient.addons.data.schemes.get({ fields: ["Name"] });

	// Add the new DeletedBy field to every pfs schema
	for (const pfsSchema of pfsSchemas) {
		if (pfsSchema.Name) {
			let objects: any[] = [];
			let page = 1;
			do {
				const findParams: FindOptions = {
					fields: ["Key", "Folder", "Hidden"],
					page: page,
					include_deleted: true,
					// No need to get objects on the root folder, which already have a trailing '/'
					where: 'Folder != "/"'
				};
				// Get a page of objects from the schema
				objects = await papiClient.addons.data.uuid(client.AddonUUID).table(pfsSchema.Name).find(findParams);

				// Keep only objects whos obj.Folder is missing a trailing '/'
				objects = objects.filter(obj => obj.Folder && !obj.Folder.endsWith('/'));

				// Create the updated Folder value
				objects = objects.map(obj => {
					return {
						Key: obj.Key,
						Folder: `${obj.Folder}/`,
						// Upserting a Hidden object will mark it Hidden=false. 
						// We have to keep the Hidden value unchanged to keep the object hidden.
						Hidden: obj.Hidden,
					}
				})

				// Check if there are objects, to avoid a redundant api call
				if (objects.length > 0) {
					await papiClient.post(`/addons/data/batch/${client.AddonUUID}/${pfsSchema.Name}`, { Objects: objects });
				}

				page++;
			}
			while (objects.length > 0);
		}
	}
}

