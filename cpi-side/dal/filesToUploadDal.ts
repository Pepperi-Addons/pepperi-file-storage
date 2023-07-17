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

        do{
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
     * true if the entry is the most recently created entry for the file, false otherwise.
     * @param fileToUpload {FileToUpload} The entry to check.
     * @returns {Promise<boolean>} A Promise that resolves to true if the entry is the most recently created entry for the file, false otherwise.
     */
    public async isLatestEntry(fileToUpload: FileToUpload): Promise<boolean>
    {
        const latestEntry = await this.getLatestEntryKey(fileToUpload);

        return latestEntry === undefined || latestEntry.Key === fileToUpload.Key;
    }

    /**
     * Get the most recently created entry for the file.
     * @param fileToUpload {FileToUpload} The file to get the most recently created entry for.
     * @returns {Promise<{ Key: string } | undefined>} A Promise that resolves to the most recently created entry for the file, or undefined if there are no entries for the file.
     */
    protected async getLatestEntryKey(fileToUpload: FileToUpload): Promise<{ Key: string } | undefined>
    {
        const searchBody: SearchBody = {
            Fields: ["Key"],
            Where: `AbsolutePath='${fileToUpload.AbsolutePath}' AND Hidden=false`,
            SortBy: "CreationDateTime desc", // The "as any" is a workaround for a bug in the PAPI SDK. It expects OrderBy and not SortBy.
            PageSize: 1,
        } as any;

        const searchResult = await this.search(searchBody);

        return searchResult.Objects[0] as { Key: string };
    }
}
