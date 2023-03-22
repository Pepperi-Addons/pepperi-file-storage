export class RelativeAbsoluteKeyService
{
    constructor(protected distributorUUID: string, protected clientAddonUUID: string, protected clientSchemaName: string) {}
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

		const absolutePrefix = `${this.distributorUUID}/${this.clientAddonUUID}/${this.clientSchemaName}/`;
		return relativePath.startsWith(absolutePrefix) ? relativePath : `${absolutePrefix}${relativePath}`;
	}

	public removeSlashPrefix(path: string)
	{
		if (path != '/' && path?.startsWith('/')) 
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
		const relativePath = absolutePath.split(`${this.distributorUUID}/${this.clientAddonUUID}/${this.clientSchemaName}/`)[1];
		const res = relativePath === '' ? '/' : relativePath; // Handle root folder case
		return res;
	}
	//#endregion
}
