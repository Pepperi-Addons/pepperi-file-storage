import { Client, Request } from '@pepperi-addons/debug-server';
import jwtDecode from 'jwt-decode';
import { IPfsGetter } from './IPfsGetter';
import { IPfsMutator } from './IPfsMutator';

export abstract class AbstractBasePfsDal implements IPfsGetter, IPfsMutator
{
	protected environment: any;
    protected DistributorUUID: any;
	protected AddonUUID: any;
    
	constructor(protected client: Client, protected request: Request)
	{
		this.environment = jwtDecode(client.OAuthAccessToken)['pepperi.datacenter'];
        this.DistributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];
		this.AddonUUID = this.request.query.addon_uuid;
	}
	
	//#region IPfsMutator
	abstract lock(item: any);

	abstract mutateS3(newFileFields: any, existingFile: any);

	abstract mutateADAL(newFileFields: any, existingFile: any);

	abstract notify(newFileFields: any, existingFile: any);
	
	abstract unlock(key: string);

	abstract invalidateCDN(key: string);
	
	//#endregion

	//#region IPfsGetter

	abstract listFolderContents(folderName: string): Promise<any>;

	abstract downloadFileMetadata(Key: string): Promise<any>;

	abstract isObjectLocked(key: string);
	//#endregion
	

	//#region protected methods
	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. An absolute path is a path that includes the Distributor's UUID, 
	 * the Addon's UUID and the trailing requested path.
	 * @param relativePath the path relative to the addon's folder
	 * @returns a string in the format ${this.DistributorUUID}/${this.AddonUUID}/${relativePath}
	 */
	protected getAbsolutePath(relativePath: string): string 
	{
		if(relativePath.startsWith('/'))
			relativePath = relativePath.slice(1);

		return `${this.DistributorUUID}/${this.AddonUUID}/${relativePath}`;
	}

	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. A relative path is a path that's relative to the addon's folder.
	 * @param absolutePath the original path the addon requested
	 * @returns a relative path string
	 */
	protected getRelativePath(absolutePath: string): string 
	{
		const relativePath = absolutePath.split(`${this.DistributorUUID}/${this.AddonUUID}/`)[1]
		const res = relativePath === '' ? '/' : relativePath; // Handle root folder case
		return res;
	}

	//#endregion
}
