import { AddonsDataSearchResult } from '@pepperi-addons/cpi-node/build/cpi-side/client-api';
import { Request } from '@pepperi-addons/debug-server';
import { AddonData } from '@pepperi-addons/papi-sdk';
import { IPfsGetter, IPfsMutator } from 'pfs-shared';
import jwtDecode from 'jwt-decode';

declare global {
    //  for singleton
    var downloadedFileKeysToLocalUrl: Map<string, {ModificationDateTime: string, LocalURL: string}>;
}

export abstract class PfsService 
{
	AddonUUID: string;
	readonly environment: string;
	existingFile: any;
	newFileFields: any = {};
	DistributorUUID: string;

	constructor(protected request: Request, OAuthAccessToken: string, protected pfsMutator: IPfsMutator, protected pfsGetter: IPfsGetter<AddonsDataSearchResult> ) 
	{
		this.environment = jwtDecode(OAuthAccessToken)['pepperi.datacenter'];
		this.DistributorUUID = jwtDecode(OAuthAccessToken)['pepperi.distributoruuid'];
		this.AddonUUID = this.request.query.addon_uuid;
	}

	static get downloadedFileKeysToLocalUrl(): Map<string, {ModificationDateTime: string, LocalURL: string}> 
	{
        if (!global.downloadedFileKeysToLocalUrl) 
		{
            global.downloadedFileKeysToLocalUrl = new Map<string, {ModificationDateTime: string, LocalURL: string}>();
        }

        return global.downloadedFileKeysToLocalUrl;
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
	protected async downloadFile(downloadKey? : string): Promise<AddonData>
	{
		const downloadKeyRes: string = downloadKey ?? this.request.body?.Key ?? this.request.query.key; 
		const canonizedPath = downloadKeyRes.startsWith('/') ? downloadKeyRes.slice(1) : downloadKeyRes;
		const whereClause = `Key="${canonizedPath}"`;
		const res = await this.pfsGetter.getObjects(whereClause);
		if (res.Objects.length === 1) 
		{
			console.log(`File Downloaded`);
			return res.Objects[0];
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
