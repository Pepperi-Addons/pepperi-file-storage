import PfsService from './pfs.service'
import { Client, Request } from '@pepperi-addons/debug-server'

// add functions here
// this function will run on the 'api/foo' endpoint
// the real function is runnning on another typescript file
export async function get_file(client: Client, request: Request) 
{
	const pfs = new PfsService(client, request);
 	return pfs.downloadFromAWS();
}

export async function post_file(client: Client, request: Request) 
{
	const pfs = new PfsService(client, request);
 	return pfs.uploadToAWS();
}

export async function list_files(client: Client, request: Request) 
{
	const pfs = new PfsService(client, request);
 	return pfs.listFiles();
}