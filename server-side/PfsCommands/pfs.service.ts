import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { IPfsMutator } from '../DAL/IPfsMutator';
import { IPfsGetter } from '../DAL/IPfsGetter';
import { Helper } from '../helper';

export abstract class PfsService 
{
	DistributorUUID: string;
	AddonUUID: string;
	readonly environment: string;
	existingFile: any;
	newFileFields: any = {};

	constructor(protected client: Client, protected request: Request, protected pfsMutator: IPfsMutator, protected pfsGetter: IPfsGetter ) 
	{
		request.header = Helper.getLowerCaseHeaders(request.header);
				 
		this.environment = jwtDecode(client.OAuthAccessToken)['pepperi.datacenter'];
		this.DistributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];
		this.AddonUUID = this.request.query.addon_uuid;

		if(this.request.body && typeof this.request.body.Hidden === 'string')
		{
			this.request.body.Hidden = this.request.body.Hidden.toLowerCase() === 'true';
		}
	}

	protected async getCurrentItemData() 
	{
		try 
		{
			this.existingFile = await this.downloadFile();
			this.existingFile.doesFileExist = true;
		}
		catch 
		{
			this.existingFile = {};
			this.existingFile.doesFileExist = false;
			this.existingFile.Key = this.request.body.Key;
			this.existingFile.Hidden = false;
		}
	}

	/**
	 * Returns wether or not a file exist.
	 */
	protected async getDoesFileExist(fileKey: string) 
	{
		let file: any = null;

		try 
		{
			file = await this.downloadFile(fileKey);
		}
		catch (e) 
		{ 
			if (e instanceof Error) 
			{
				console.log(e.message);
			}
		}

		const res = !!file;

		return res;
	}

	/**
	 * Download the file's metadata.
	 * @returns 
	 */
	protected async downloadFile(downloadKey? : string) 
	{
		const downloadKeyRes: string = downloadKey ?? ((this.request.body && this.request.body.Key) ? this.request.body.Key : this.request.query.Key); 
		const canonizedPath = downloadKeyRes.startsWith('/') ? downloadKeyRes.slice(1) : downloadKeyRes;
		const whereClause = `Key='${canonizedPath}'`;
		const res = await this.pfsGetter.getObjects(whereClause);
		if (res.length === 1) 
		{
			console.log(`File Downloaded`);
			return res[0];
		}
		else 
		{ //Couldn't find results
			console.error(`Could not find requested item: '${downloadKeyRes}'`);
			const err: any = new Error(`Could not find requested item: '${downloadKeyRes}'`);
			err.code = 404;
			throw err;
		}
	}
}

export default PfsService;
