import { SearchBody, SearchData } from "@pepperi-addons/papi-sdk";
import { Mutex } from "async-mutex";
import { FILES_TO_UPLOAD_TABLE_NAME, FileToUpload, IPepperiDal } from "pfs-shared";


/**
 * A Data Access Layer for the FilesToUpload table.
 */
export class FilesToUploadDal
{
	
	public static readonly mutex = new Mutex();

	constructor(protected pepperiDal: IPepperiDal)
	{}

	/**
     * Search the FilesToUpload table.
     * @param searchBody {SearchBody} The search body.
     * @returns {Promise<SearchData<FileToUpload>>} A Promise that resolves to the search results.
     */
	public async search(searchBody: SearchBody): Promise<SearchData<FileToUpload>>
	{
		return await this.pepperiDal.searchDataInTable(FILES_TO_UPLOAD_TABLE_NAME, searchBody) as SearchData<FileToUpload>;
	}

	/**
     * Get all entries from the FilesToUpload table.
     * @returns {Promise<FileToUpload[]>} A Promise that resolves to the entries.
     */
	public async getAllFilesToUpload(): Promise<FileToUpload[]>
	{
		const allFilesToUpload: FileToUpload[] = [];
		const searchBody: SearchBody = {
			PageSize: 1000,
			Page: 0
		};

		let searchResult: SearchData<FileToUpload>;

		do
		{
            searchBody.Page!++;
            searchResult = await this.search(searchBody);
            allFilesToUpload.push(...searchResult.Objects);

		} while (searchResult.Objects.length > 0);

		return allFilesToUpload;
	}

	/**
     * Get an entry from the FilesToUpload table by key.
     * @param key {string} The key of the entry to get.
     * @returns {Promise<FileToUpload>} A Promise that resolves to the entry.
     * @throws {Error} If the entry is not found.
     */
	public async getByKey(key: string): Promise<FileToUpload>
	{
		return (await this.search({ KeyList: [key] })).Objects[0];
	}

	/**
     * Upsert an entry to the FilesToUpload table.
     * 
     * @param fileToUpload {FileToUpload} The entry to upsert.
     * @returns {boolean} true if the entry is the most recently created entry for the file, false otherwise.
     */
	public async upsert(fileToUpload: FileToUpload): Promise<FileToUpload>
	{
		return await this.pepperiDal.postDocumentToTable(FILES_TO_UPLOAD_TABLE_NAME, fileToUpload) as FileToUpload;
	}


	/**
     * Get the most recently created entry for the file.
     * @param fileToUpload {FileToUpload} The file to get the most recently created entry for.
     * @returns {Promise<{ Key: string } | undefined>} A Promise that resolves to the Key of the most recently created entry for the file, or undefined if there are no entries for the file.
     */
	public async getLatestEntryKey(fileToUpload: FileToUpload): Promise<string | undefined>
	{
		const searchBody: SearchBody = {
			Fields: ["Key"],
			Where: `AbsolutePath='${fileToUpload.AbsolutePath}' AND Hidden=false`,
			SortBy: "CreationDateTime desc", // The "as any" is a workaround for a bug in the PAPI SDK. It expects OrderBy and not SortBy.
			PageSize: 1,
		} as any;

		const searchResult = await this.search(searchBody);

		return searchResult.Objects[0]?.Key;
	}

	/**
     * Hide older entries of the file.
     * @param fileToUpload {FileToUpload} The file to hide older entries of.
     * @returns {Promise<void>} A Promise that resolves when the older entries are hidden.
     */
	public async hideOlderEntries(fileToUpload: FileToUpload): Promise<void>
	{
		// Get older or equal versions
		const olderVersions = await this.getOlderEntries(fileToUpload);

		// Remove older versions
		const promises = olderVersions.map(f => 
		{
			f.Hidden = true;
			return this.upsert(f);
		});

		await Promise.allSettled(promises);
	}

	/**
     * Get older versions of the file.
     * @param fileToUpload {FileToUpload} The file to get older versions of.
     * @returns {Promise<FileToUpload[]>} A Promise that resolves to the older versions.
     */
	protected async getOlderEntries(fileToUpload: FileToUpload): Promise<FileToUpload[]>
	{
		// We might not get the CreationDateTime. If so, we'll get it from the DB.
		// Make a copy so as not to change the original object.
		const fileToUploadCopy = { ...fileToUpload };
		fileToUploadCopy.CreationDateTime = fileToUploadCopy.CreationDateTime ?? (await this.getByKey(fileToUploadCopy.Key!)).CreationDateTime;

		const res: FileToUpload[] = [];
		let searchResult: SearchData<FileToUpload>;

		const searchBody: SearchBody = {
			Where: `AbsolutePath='${fileToUpload.AbsolutePath}' AND CreationDateTime <= '${fileToUpload.CreationDateTime}'`,
			Fields: ["Key", "CreationDateTime"],
			Page: 0,
			PageSize: 1000,
		};

		do
		{
            searchBody.Page!++;
            searchResult = await this.search(searchBody);

            res.push(...searchResult.Objects);
		}
		while (searchResult.Objects.length >= searchBody.PageSize!);

		return res;
	}
}
