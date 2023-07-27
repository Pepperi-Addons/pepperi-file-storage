
/*
The return object format MUST contain the field 'success':
{success:true}
If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { Client, Request } from "@pepperi-addons/debug-server";
import { AddonData, AddonDataScheme, FindOptions, PapiClient, Relation, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";
import semverLessThan from "semver/functions/lt";
import clonedeep from "lodash.clonedeep";
import { FILES_TO_UPLOAD_TABLE_NAME, LOCK_ADAL_TABLE_NAME, pfsSchemaData, PFS_TABLE_PREFIX } from "pfs-shared/lib/constants";
import { AddonUUID } from "../addon.config.json";

export async function install(client: Client, request: Request): Promise<any> 
{

	const papiClient = createPapiClient(client);
	await createLockADALTable(papiClient);
	await createFilesToUploadSchema(papiClient);
	await createDimxRelations(papiClient, client);

	return { success: true, resultObject: {} };
}

export async function uninstall(client: Client, request: Request): Promise<any> 
{
	const papiClient = createPapiClient(client);
	await papiClient.post(`/addons/data/schemes/${LOCK_ADAL_TABLE_NAME}/purge`);

	return { success: true, resultObject: {} };
}

export async function upgrade(client: Client, request: Request): Promise<any> 
{
	const papiClient = createPapiClient(client);

	if(request.body.FromVersion && semverLessThan(request.body.FromVersion, "1.0.1"))
	{
		throw new Error("Upgrading from versions earlier than 1.0.1 is not supported. Please uninstall the addon and install it again.");
	}
	
	if(request.body.FromVersion && semverLessThan(request.body.FromVersion, "1.2.7"))
	{
		console.log("Migrating internal schemas to have SyncData.PushLocalChanges = false...");
		// For more details see DI-21812: https://pepperi.atlassian.net/browse/DI-21812
		await migrateSchemasToNotPushLocalChanges(papiClient, client);

		console.log("Creating a new schema for the files to upload table...");
		await createFilesToUploadSchema(papiClient);
	}

	if(request.body.FromVersion && semverLessThan(request.body.FromVersion, "1.1.6"))
	{
		console.log("Migrating internal schemas to schemas that don't use '-' char...");
		// For more details see DI-21812: https://pepperi.atlassian.net/browse/DI-21812
		await migrateSchemasToNotUseMinusChar(papiClient, client);
	}

	if (request.body.FromVersion && semverLessThan(request.body.FromVersion, "1.0.4"))
	{
		// Add the new TransactionType field to the lock table schema
		await createLockADALTable(papiClient);

		// Add the new DeletedBy field to every pfs schema
		await addDeletedByFieldToPfsSchemas(papiClient);

	}

	if (request.body.FromVersion && semverLessThan(request.body.FromVersion, "1.0.8"))
	{
		await addTrailingSlashToFolderProperty(papiClient, client);
	}

	if (request.body.FromVersion && semverLessThan(request.body.FromVersion, "1.0.29"))
	{
		console.log("Updating \"Name\" field on all schemas");
		await updateNameField(papiClient);
	}

	if (request.body.FromVersion && semverLessThan(request.body.FromVersion, "1.3.12"))
	{
		console.log("Removing URI property from any document that has it");
		await removeUriFromSavedObjects(papiClient);
	}

	return { success: true, resultObject: {} };
}

export async function downgrade(client: Client, request: Request): Promise<any> 
{
	return { success: true, resultObject: {} };
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
	};

	//Add Transaction Type field to schema
	pfsMetadataTable.Fields.TransactionType = {
		Type: "String",
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
		Name: "pfs",
		KeyName: "Key",
		Type: "AddonAPI",
		AddonRelativeURL: "/data-source-api/batch"
	};

	const exportRelation: Relation = {
		RelationName: "DataExportSource",
		AddonUUID: client.AddonUUID,
		Name: "pfs",
		Type: "AddonAPI",
		AddonRelativeURL: "/data-source-api/pfs_export"
	};

	await upsertRelation(papiClient, importRelation);
	await upsertRelation(papiClient, exportRelation);
}

async function upsertRelation(papiClient: PapiClient, relation: Relation) 
{
	return papiClient.post("/addons/data/relations", relation);
}

/**
 * Add the new DeletedBy field to every pfs data schema
 */
async function addDeletedByFieldToPfsSchemas(papiClient: PapiClient) 
{
	const manipulatorFunction = async (schema: AddonDataScheme) : Promise<void> => 
	{
		if (schema.Fields) 
		{
			schema.Fields.DeletedBy = {
				Type: "String",
				Indexed: true,
				Keyword: true,
			};

			await papiClient.addons.data.schemes.post(schema);
		}
	};

	await manipulateAllPfsSchemas(papiClient, manipulatorFunction);
}

export async function updateNameField(papiClient: PapiClient) 
{
	const manipulatorFunction = async (schema: AddonDataScheme) : Promise<void> => 
	{
		if (schema.Fields  && !schema.Fields.Name?.Indexed) 
		{

			console.log("Setting Name field Indexed=true...");
			schema.Fields.Name =
			{
				Type: "String",
				Indexed: true,
			};

			await papiClient.addons.data.schemes.post(schema);
			console.log("Done setting Name field Indexed=true.");

			console.log(`Rebuilding (clean) schema: '${schema.Name}'...`);
			const rebuildResponse = await papiClient.post(`/addons/api/async/00000000-0000-0000-0000-00000000ada1/indexed_adal_api/clean_rebuild?table_name=${schema.Name}`);
			console.log(`Rebuild response: ${JSON.stringify(rebuildResponse)}`);
		}
	};

	await manipulateAllPfsSchemas(papiClient, manipulatorFunction);
}

async function manipulateAllPfsSchemas(papiClient: PapiClient, manipulatorFunction: (schema: AddonDataScheme) => Promise<void>)
{
	// Get all schemas whose name starts with 'pfs_%'
	console.log("Getting all pfs_ schemas...");
	const pfsSchemas: Array<AddonDataScheme> = await papiClient.addons.data.schemes.get({ where: `Name like '${PFS_TABLE_PREFIX}_%'` });

	console.log("Done getting all pfs_ schemas.");

	for (const pfsSchema of pfsSchemas)
	{
		console.log(`Executing manipulation on schema '${pfsSchema.Name}'...`);
		await manipulatorFunction(pfsSchema);

		console.log(`Done manipulating schema '${pfsSchema.Name}'.`);
	}
}

export async function addTrailingSlashToFolderProperty(papiClient: PapiClient, client: Client) 
{
	// Get all pfs schemas
	const pfsSchemas: Array<AddonDataScheme> = await papiClient.addons.data.schemes.get({ fields: ["Name"] });

	for (const pfsSchema of pfsSchemas) 
	{
		// Manipulate client schemas (pfs_{addon_uuid}_{client_addon_schema}) as well as the lock table.
		// Don't manipulate the FILES_TO_UPLOAD schema or any other that might be invented in the future.
		if (pfsSchema.Name?.startsWith(PFS_TABLE_PREFIX) || pfsSchema?.Name === LOCK_ADAL_TABLE_NAME) 
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

				// Keep only objects whose obj.Folder is missing a trailing '/'
				objects = objects.filter(obj => obj.Folder && !obj.Folder.endsWith("/"));

				// Create the updated Folder value
				objects = objects.map(obj => 
				{
					return {
						Key: obj.Key,
						Folder: `${obj.Folder}/`,
						// Upserting a Hidden object will mark it Hidden=false. 
						// We have to keep the Hidden value unchanged to keep the object hidden.
						Hidden: obj.Hidden,
					};
				});

				// Check if there are objects, to avoid a redundant api call
				if (objects.length > 0) 
				{
					await papiClient.post(`/addons/data/batch/${client.AddonUUID}/${pfsSchema.Name}`, { Objects: objects });
				}

				page++;
			}
			while (objects.length > 0);
		}
	}
}

async function migrateSchemasToNotUseMinusChar(papiClient: PapiClient, client: Client) 
{
	const manipulatorFunction = async (originalSchema: AddonDataScheme) : Promise<void> =>
	{
		if (originalSchema.Name.includes("-"))
		{
			// Create a new schema, whose name does not include '-'.
			const validSchema = await createSchemaWithoutMinus(originalSchema);

			// Copy all documents from existing schema to the new one.
			await migrateDocuments(originalSchema, validSchema);

			// Unsubscribe from original schema's PNS
			await unsubscribeFromSchema(originalSchema);

			// Purge original schema
			await papiClient.post(`/addons/data/schemes/${originalSchema.Name}/purge`);

			// Subscribe to new schema's PNS
			await subscribeToSchema(validSchema);
		}
	};

	await manipulateAllPfsSchemas(papiClient, manipulatorFunction);

	async function createSchemaWithoutMinus(originalSchema: AddonDataScheme)
	{
		const validSchema = clonedeep(originalSchema);
		validSchema.Name = validSchema.Name.replace(/-/g, "");
		return await papiClient.addons.data.schemes.post(validSchema);
	}
	
	async function migrateDocuments(sourceSchema: AddonDataScheme, destinationSchema: AddonDataScheme) 
	{
		let objects: AddonData[] = [];
		let page = 1;
		do 
		{
			const findParams: FindOptions = {
				page: page,
				include_deleted: true,
			};
			// Get a page of objects from the schema
			objects = await papiClient.addons.data.uuid(client.AddonUUID).table(sourceSchema.Name).find(findParams);

			// Check if there are objects, to avoid a redundant api call
			if (objects.length > 0) 
			{
				await papiClient.post(`/addons/data/batch/${client.AddonUUID}/${destinationSchema.Name}`, { Objects: objects });
			}

			page++;
		}
		while (objects.length > 0);
	}

	async function unsubscribeFromSchema(schema: AddonDataScheme)
	{
		const subscription = await papiClient.notification.subscriptions.find({where: `Name='pfs-expired-records-${schema.Name}'`});
		if(subscription?.length > 0)
		{
			const shouldHide = true;
			await upsertSubscription(schema, shouldHide);
		}
	}

	async function subscribeToSchema(schema: AddonDataScheme)
	{
		const shouldHide = false;
		await upsertSubscription(schema, shouldHide);
	}

	async function upsertSubscription(schema: AddonDataScheme, hidden: boolean)
	{
		papiClient.notification.subscriptions.upsert({
			AddonUUID: client.AddonUUID,
			Name: `pfs-expired-records-${schema.Name}`, // Names of subscriptions should be unique
			Type: "data",
			FilterPolicy: {
				Resource: [schema.Name],
				Action: ["remove"],
				AddonUUID: [client.AddonUUID]
			},
			AddonRelativeURL: "/api/record_removed",
			Hidden: hidden,
		});
	}
}


async function migrateSchemasToNotPushLocalChanges(papiClient: PapiClient, client: Client) 
{
	const manipulatorFunction = async (schema: AddonDataScheme) : Promise<void> => 
	{
		// Set PushLocalChanges to false only if Sync is true
		if (schema.SyncData?.Sync && !schema.SyncData.PushLocalChanges)
		{

			console.log(`Setting SyncData.PushLocalChanges=false for schema "${schema.Name}"...`);
			schema.SyncData.PushLocalChanges = false;

			await papiClient.addons.data.schemes.post(schema);
			console.log("Done setting SyncData.PushLocalChanges=false.");
		}
	};

	await manipulateAllPfsSchemas(papiClient, manipulatorFunction);
}

async function createFilesToUploadSchema(papiClient: PapiClient) 
{
	
	const filesToUploadSchema: AddonDataScheme = {
		Name: FILES_TO_UPLOAD_TABLE_NAME,
		Fields: {
			Key: {
				Type: "String",
			},
			AbsolutePath: {
				Type: "String",
			}
		},
		SyncData: {
			Sync: true,
			PushLocalChanges: false,
		},
	};

	await papiClient.addons.data.schemes.post(filesToUploadSchema);
}

async function removeUriFromSavedObjects(papiClient: PapiClient): Promise<void>
{
	const manipulatorFunction = async (schema: AddonDataScheme) : Promise<void> => 
	{
		let searchData: SearchData<AddonData>;
		let nextPageKey: string | undefined;
		do 
		{
			const searchBody: SearchBody = {
				Fields: ["Key", "URI", "Hidden"],
				PageKey: nextPageKey,
				IncludeDeleted: true,
				// No need to get folders, since they don't have URI
				Where: 'MIME != "pepperi/folder"'
			};

			// Get a page of objects from the schema
			searchData = await papiClient.addons.data.search.uuid(AddonUUID).table(schema.Name).post(searchBody);

			// Keep only objects that have URI
			searchData.Objects = searchData.Objects.filter(obj => obj.URI);

			// Set these objects' URI to empty string
			searchData.Objects = searchData.Objects.map(obj => 
			{
				return {
					Key: obj.Key,
					URI: "",
					Hidden: obj.Hidden,
				};
			});

			// Check if there are objects, to avoid a redundant api call
			if (searchData.Objects.length > 0) 
			{
				await papiClient.post(`/addons/data/batch/${AddonUUID}/${schema.Name}`, { Objects: searchData.Objects });
			}
		}
		while (searchData.NextPageKey);
	};

	await manipulateAllPfsSchemas(papiClient, manipulatorFunction);
}
