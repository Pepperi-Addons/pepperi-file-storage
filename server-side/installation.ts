
/*
The return object format MUST contain the field 'success':
{success:true}
If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { Client, Request } from '@pepperi-addons/debug-server'
import { AddonDataScheme, CodeJob, FindOptions, PapiClient, Relation } from '@pepperi-addons/papi-sdk';
import { LOCK_ADAL_TABLE_NAME, pfsSchemaData, PFS_TABLE_PREFIX, TRANSACTION_UNLOCK_JOB_ADDITIONAL_DATA_FIELD, TRANSACTION_UNLOCK_JOB_NAME } from './constants';
import semver from 'semver';

export async function install(client: Client, request: Request): Promise<any> 
{

	const papiClient = createPapiClient(client);
	await createLockADALTable(papiClient);
	await createDimxRelations(papiClient, client);
	const codeJob: CodeJob = await createTransactionUnlockCodeJob(papiClient, client);
	await setCodeJobUuidOnInstalledAddonAdditionalData(papiClient, client, codeJob);

	return { success: true, resultObject: {} }
}

export async function uninstall(client: Client, request: Request): Promise<any> 
{
	const papiClient = createPapiClient(client);
	await papiClient.post(`/addons/data/schemes/${LOCK_ADAL_TABLE_NAME}/purge`);
	const additionalData = await getAddonAdditionalData(papiClient, client);
	await deleteTransactionUnlockCodeJob(additionalData, papiClient);

	return { success: true, resultObject: {} }
}

export async function upgrade(client: Client, request: Request): Promise<any> 
{
	const papiClient = createPapiClient(client);

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.1') < 0) 
	{
		throw new Error('Upgrading from versions earlier than 1.0.1 is not supported. Please uninstall the addon and install it again.');
	}

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.4') < 0) 
	{
		// Add the new TransactionType field to the lock table schema
		await createLockADALTable(papiClient);

		// Add the new DeletedBy field to every pfs schema
		await addDeletedByFieldToPfsSchemas(papiClient);

	}

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.8') < 0) 
	{
		await addTrailingSlashToFolderProperty(papiClient, client);
	}

	if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.18') < 0) 
	{
		const codeJob: CodeJob = await createTransactionUnlockCodeJob(papiClient, client);
		await setCodeJobUuidOnInstalledAddonAdditionalData(papiClient, client, codeJob);
	}

	return { success: true, resultObject: {} }
}

export async function downgrade(client: Client, request: Request): Promise<any> 
{
	if (request.body.FromVersion && semver.compare(request.body.ToVersion, '1.0.18') < 0) 
	{
		const papiClient = createPapiClient(client);
		const additionalData = await getAddonAdditionalData(papiClient, client);
		await deleteTransactionUnlockCodeJob(additionalData, papiClient);
	}
	
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

export async function addTrailingSlashToFolderProperty(papiClient: PapiClient, client: Client) 
{
	// Get all pfs schemas
	const pfsSchemas: Array<AddonDataScheme> = await papiClient.addons.data.schemes.get({fields: ["Name"]});

	// Add the new DeletedBy field to every pfs schema
	for (const pfsSchema of pfsSchemas) 
	{
		if(pfsSchema.Name)
		{
			let objects: any[] = [];
			let page = 1;
			do
			{
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
				objects = objects.map(obj => 
				{
					return {
						Key: obj.Key,
						Folder: `${obj.Folder}/`,
						// Upserting a Hidden object will mark it Hidden=false. 
						// We have to keep the Hidden value unchanged to keep the object hidden.
						Hidden: obj.Hidden,
					}
				})

				// Check if there are objects, to avoid a redundant api call
				if(objects.length > 0)
				{
					await papiClient.post(`/addons/data/batch/${client.AddonUUID}/${pfsSchema.Name}`, {Objects: objects});
				}

				page++;
			}
			while(objects.length > 0);
		}
	}
}

async function createTransactionUnlockCodeJob(papiClient: PapiClient, client: Client) {
	const codeJobBody: CodeJob = {
		CodeJobName: TRANSACTION_UNLOCK_JOB_NAME,
		Description: 'Unlock any stale locks found in the PfsLockTable',
		IsScheduled: true,
		AddonPath: "api",
		AddonUUID: client.AddonUUID,
		NumberOfTries: 3,
		FunctionName: "unlock_transactions",
		CronExpression: await getCronExpression(papiClient)
	}

	console.log('create the code Job');

	const codeJob = await papiClient.codeJobs.upsert(codeJobBody);

	console.log('Done creating the transaction unlock job, codeJobUUID: ' + codeJob.UUID);

	return codeJob;
}

async function setCodeJobUuidOnInstalledAddonAdditionalData(papiClient: PapiClient, client: Client, codeJob: CodeJob)
{
	console.log('Update the installed addon with the transaction unlock code job UUID');

	const installedAddon = await papiClient.addons.installedAddons.upsert(
		{
			Addon: {UUID: client.AddonUUID},
			AdditionalData: `{"${TRANSACTION_UNLOCK_JOB_ADDITIONAL_DATA_FIELD}": "${codeJob.UUID}"}`,
			PublicBaseURL: papiClient['baseURL'],
		});
	console.log('Done updating the installed addon: ' + installedAddon);
}

async function getCronExpression(papiClient: PapiClient): Promise<string> {
	const maintenanceData = await papiClient.metaData.flags.name('Maintenance').get();
	const MaintenanceWindow = maintenanceData.MaintenanceWindow;
	const parts = MaintenanceWindow.split(':');
	const hour = parts[0];
	const minutes = parts[1] == '00' ? '0' : parts[1];
	const cronExpression = minutes + ' ' + hour + ' * * *';

	return cronExpression;
}

async function deleteTransactionUnlockCodeJob(data, papiClient:PapiClient)
{
	const codeJob = data[TRANSACTION_UNLOCK_JOB_ADDITIONAL_DATA_FIELD];

	if (codeJob)
	{
		await papiClient.codeJobs.upsert({
			UUID: codeJob,
			CodeJobName: TRANSACTION_UNLOCK_JOB_NAME,
			CodeJobIsHidden: true,
		});
	}
}

async function getAddonAdditionalData(papiClient: PapiClient, client: Client)
{
	let data = {};
	const addon = await papiClient.addons.installedAddons.addonUUID(client.AddonUUID).get();
	if (addon?.AdditionalData)
	{
		data = JSON.parse(addon.AdditionalData);
	}
	return data;
}
