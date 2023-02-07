import { Request } from '@pepperi-addons/debug-server';
import { AddonData } from '@pepperi-addons/papi-sdk';
import jwtDecode from 'jwt-decode';
import { IPfsGetter, IPfsMutator, TransactionType } from '..';
import { v4 as createUUID } from 'uuid';
export abstract class AbstractBasePfsDal implements IPfsGetter, IPfsMutator
{
	protected environment: string;
    protected DistributorUUID: string;
	protected clientAddonUUID: string;
	protected readonly MAXIMAL_LOCK_TIME; 
	protected clientSchemaName: string;
    
	constructor(protected OAuthAccessToken: string, protected request: Request, maximalLockTime:number)
	{
		this.environment = jwtDecode(OAuthAccessToken)['pepperi.datacenter'];
        this.DistributorUUID = jwtDecode(OAuthAccessToken)['pepperi.distributoruuid'];
		this.clientAddonUUID = this.request.query.addon_uuid;
		this.clientSchemaName = this.request.query.resource_name;
		this.MAXIMAL_LOCK_TIME = maximalLockTime;
	}

	getMaximalLockTime() {
		return this.MAXIMAL_LOCK_TIME;
	}
	
	//#region IPfsMutator
	abstract lock(key: string, transactionType: TransactionType);

	abstract setRollbackData(item: any);

	abstract mutateS3(newFileFields: any, existingFile: any);

	abstract mutateADAL(newFileFields: any, existingFile: any);

	abstract notify(newFileFields: any, existingFile: any);
	
	abstract unlock(key: string);

	abstract invalidateCDN(file: any);

	abstract deleteS3FileVersion(Key: any, s3FileVersion: any);

	abstract batchDeleteS3(keys: string[]);

	abstract createTempFile(tempFileName: string, MIME: string);
	
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
	protected isTempFile(url: string): boolean
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

	//#endregion
}
