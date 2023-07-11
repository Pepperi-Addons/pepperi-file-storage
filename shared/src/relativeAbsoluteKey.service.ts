export class RelativeAbsoluteKeyService
{
	protected _distributorUUID: string;
	protected _clientAddonUUID: string;
	protected _clientSchemaName: string;

	constructor(absolutePath: string);
	constructor(distributorUUID: string, clientAddonUUID: string, clientSchemaName: string);

	constructor(arg0: string, clientAddonUUID?: string, clientSchemaName?: string) 
	{
		if(!(clientAddonUUID && clientSchemaName))
		{
			const splitAbsolutePath = arg0.split("/");
			arg0 = splitAbsolutePath[0];
			clientAddonUUID = splitAbsolutePath[1];
			clientSchemaName = splitAbsolutePath[2];

		}
		
		this._distributorUUID = arg0;
		this._clientAddonUUID = clientAddonUUID;
		this._clientSchemaName = clientSchemaName;
		
	}

	public get distributorUUID(): string
	{
		return this._distributorUUID;
	}

	public get clientAddonUUID(): string
	{
		return this._clientAddonUUID;
	}

	public get clientSchemaName(): string
	{
		return this._clientSchemaName;
	}

	//#region public methods

	/**
	* Each distributor is given its own folder, and each addon has its own folder within the distributor's folder.
	* Addons place objects in their folder. An absolute path is a path that includes the Distributor's UUID, 
	* the Addon's UUID and the trailing requested path.
	* @param relativePath the path relative to the addon's folder
	* @returns a string in the format ${this.DistributorUUID}/${this.AddonUUID}/${relativePath}
	*/
	public getAbsolutePath(relativePath: string): string 
	{
		relativePath = this.removeSlashPrefix(relativePath);

		const absolutePrefix = `${this._distributorUUID}/${this._clientAddonUUID}/${this._clientSchemaName}/`;
		return relativePath.startsWith(absolutePrefix) ? relativePath : `${absolutePrefix}${relativePath}`;
	}

	public removeSlashPrefix(path: string)
	{
		if (path != "/" && path?.startsWith("/")) 
		{
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
	public getRelativePath(absolutePath: string): string 
	{
		const relativePath = absolutePath.split(`${this._distributorUUID}/${this._clientAddonUUID}/${this._clientSchemaName}/`)[1];
		const res = relativePath === "" ? "/" : relativePath; // Handle root folder case
		return res;
	}
	//#endregion
}
