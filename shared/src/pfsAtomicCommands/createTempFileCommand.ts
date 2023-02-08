import jwtDecode from 'jwt-decode';
import { v4 as createUUID } from 'uuid';

import { CdnServers, TempFile } from '../constants';
import { ICommand } from '../iCommand';
import PfsService from '../pfs.service';
import { Request } from '@pepperi-addons/debug-server/dist';
import { IPfsMutator } from '../iPfsMutator';
import { IPfsGetter } from '../iPfsGetter';

export class CreateTempFileCommand extends PfsService implements ICommand 
{
	protected DistributorUUID: string;
	protected environment: string;

	constructor(OAuthAccessToken: string, request: Request, pfsMutator: IPfsMutator, pfsGetter: IPfsGetter)
	{
		super(request, pfsMutator, pfsGetter);

		this.DistributorUUID = jwtDecode(OAuthAccessToken)['pepperi.distributoruuid'];
		this.environment = jwtDecode(OAuthAccessToken)['pepperi.datacenter'];
	}
	public async execute(): Promise<TempFile>{
		return await this.createTempFile();
	}

	protected async createTempFile(): Promise<TempFile>
	{
		const tempFileKey = this.createTempFileFullPath(this.request.body.FileName);
		const putURL = await this.pfsMutator.createTempFile(tempFileKey, this.request.body.MIME);

		// Create a GET url for the temp file
		const downloadURL =  `${CdnServers[this.environment]}/${tempFileKey}`;

		// Create a TempFile object
		const res: TempFile = {
			PutURL: putURL,
			DownloadURL: downloadURL,
		};
		
		return res;
	}

	/**
	 * Create a temp file full path by its name
	 * @param tempFileName the temp file name
	 * @returns a string in the format ${DistributorUUID}/temp/{{randomUUID}}/${tempFileName}
	 */
	 protected createTempFileFullPath(tempFileName: string): string
	 {
		 return `${this.DistributorUUID}/temp/${createUUID()}/${tempFileName ? tempFileName : createUUID()}`;
	 }
 
	 /**
	  * Returns wether or not a given URL belongs to a temp file
	  * @param {string} url the URL to check
	  * @returns {boolean} true if the URL belongs to a temp file, false otherwise
	  */
	 public isTempFile(url: string): boolean
	 {
		 let res = true;
 
		 const tempFilePrefix = `${this.DistributorUUID}/temp/`;
		 let urlObject: URL;
		 try
		 {
			 // Create a URL object from the given URL string
			 urlObject = new URL(url);
 
			 // Get the path from the URL object
			 const path = urlObject.pathname;
 
			 // Check if the path starts with the temp file prefix
			 res = path.startsWith(tempFilePrefix);
		 }
		 catch
		 {
			 res = false;
		 }
		 
		 return res;
 
	 }
}
