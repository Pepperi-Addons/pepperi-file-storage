
/*
The return object format MUST contain the field 'success':
{success:true}
If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { Client, Request } from '@pepperi-addons/debug-server'
import { PapiClient } from '@pepperi-addons/papi-sdk';
import { METADATA_ADAL_TABLE_NAME } from './constants';

export async function install(client: Client, request: Request): Promise<any> 
{

	const papiClient = createPapiClient(client);
	await createMetadataADALTable(papiClient);

	return { success: true, resultObject: {} }
}

async function createMetadataADALTable(papiClient: PapiClient) 
{
	await papiClient.addons.data.schemes.post({
		Name: METADATA_ADAL_TABLE_NAME,
		Type: 'indexed_data',
		Fields: {
			Description: {
				Type: 'String',
			},
			MIME: {
				Type: 'String',
			},
			Sync: {
				Type: 'String',
			},
			Thumbnails: {
				Type: 'String'
			},
			Folder: {
				Type: 'String',
				Indexed: true
			},
			Name: {
				Type: 'String',
				Indexed: true
			},
			BasePath: {
				Type: 'String',
				Indexed: true
			},
			URL: {
				Type: 'String'
			}
		} as any,
	});
}

export async function uninstall(client: Client, request: Request): Promise<any> 
{
	return { success: true, resultObject: {} }
}

export async function upgrade(client: Client, request: Request): Promise<any> 
{
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
