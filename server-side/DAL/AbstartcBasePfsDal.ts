import { Client, Request } from '@pepperi-addons/debug-server';
import { AddonData } from '@pepperi-addons/papi-sdk';
import jwtDecode from 'jwt-decode';
import { IPfsGetter } from './IPfsGetter';
import { IPfsMutator } from './IPfsMutator';

export abstract class AbstractBasePfsDal implements IPfsGetter, IPfsMutator
{
	protected environment: string;
    protected DistributorUUID: string;
	protected clientAddonUUID: string;
	protected readonly MAXIMAL_LOCK_TIME; 
	protected clientSchemaName: string;
    
	constructor(protected client: Client, protected request: Request, maximalLockTime:number)
	{
		this.environment = jwtDecode(client.OAuthAccessToken)['pepperi.datacenter'];
        this.DistributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];
		this.clientAddonUUID = this.request.query.addon_uuid;
		this.clientSchemaName = this.request.query.resource_name;
		this.MAXIMAL_LOCK_TIME = maximalLockTime;
	}

	getMaximalLockTime() {
		return this.MAXIMAL_LOCK_TIME;
	}
	
	//#region IPfsMutator
	abstract lock(key: string);

	abstract setRollbackData(item: any);

	abstract mutateS3(newFileFields: any, existingFile: any);

	abstract mutateADAL(newFileFields: any, existingFile: any);

	abstract notify(newFileFields: any, existingFile: any);
	
	abstract unlock(key: string);

	abstract invalidateCDN(file: any);

	abstract deleteS3FileVersion(Key: any, s3FileVersion: any);

	abstract batchDeleteS3(keys: string[]);
	
	//#endregion

	//#region IPfsGetter

	abstract isObjectLocked(key: string);

	abstract getObjectS3FileVersion(Key: any);

	abstract getObjects(whereClause?: string): Promise<AddonData[]>;
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
		relativePath = this.removeSlashPrefix(relativePath);

		const absolutePrefix = `${this.DistributorUUID}/${this.clientAddonUUID}/${this.clientSchemaName}/`;
		return relativePath.startsWith(absolutePrefix) ? relativePath : `${absolutePrefix}${relativePath}`;
	}

	protected removeSlashPrefix(path: string){
		if (path != '/' && path?.startsWith('/')) {
			path = path.slice(1);
		}
		return path;
	}

	/**
	 * Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	 * Addons place objects in their folder. A relative path is a path that's relative to the addon's folder.
	 * @param absolutePath the original path the addon requested
	 * @returns a relative path string
	 */
	protected getRelativePath(absolutePath: string): string 
	{
		const relativePath = absolutePath.split(`${this.DistributorUUID}/${this.clientAddonUUID}/${this.clientSchemaName}/`)[1]
		const res = relativePath === '' ? '/' : relativePath; // Handle root folder case
		return res;
	}

	//#endregion
}
