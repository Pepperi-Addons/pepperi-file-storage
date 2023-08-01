import { Request } from "@pepperi-addons/debug-server";
import { AddonData, SearchBody } from "@pepperi-addons/papi-sdk";
import { IPfsGetter } from "./iPfsGetter";
import { IPfsMutator } from "./iPfsMutator";

export abstract class PfsService
{
	AddonUUID: string;
	existingFile: any;
	newFileFields: any = {};

	constructor(protected request: Request, protected pfsMutator: IPfsMutator, protected pfsGetter: IPfsGetter ) 
	{
				 
		this.AddonUUID = this.request.query.addon_uuid;

		if(this.request.body && typeof this.request.body.Hidden === "string")
		{
			this.request.body.Hidden = this.request.body.Hidden.toLowerCase() === "true";
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
	protected async downloadFile(downloadKey? : string): Promise<AddonData>
	{
		const downloadKeyRes: string = downloadKey ?? ((this.request.body && this.request.body.Key) ? this.request.body.Key : this.request.query.Key); 
		const canonizedPath = downloadKeyRes.startsWith("/") ? downloadKeyRes.slice(1) : downloadKeyRes;

		const searchBody: SearchBody = {
			KeyList: [
				canonizedPath
			]
		};
		const res = await this.pfsGetter.getObjects(searchBody);
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
