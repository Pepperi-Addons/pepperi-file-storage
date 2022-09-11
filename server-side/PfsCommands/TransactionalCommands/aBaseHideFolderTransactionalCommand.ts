import { Helper } from "../../helper";
import { ListObjectsCommand } from "../AtomicCommands/listObjectsCommand";
import { ABaseTransactionalCommand } from "./aBaseTransactionalCommand";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { TransactionType } from "../../constants";
import { files } from "../../api";

export abstract class ABaseHideFolderTransactionalCommand extends ABaseTransactionalCommand{

	readonly TRANSACTION_TYPE: TransactionType = 'hide' ;
	readonly ASYNC_HIDE_FOLDER_RETRY = 3;

	abstract executeTransaction(): Promise<any>;

	public abstract preLockLogic(): Promise<void>;

	public abstract lock(): Promise<void>;

	protected async canonizeFolderKey()
	{
		this.request.body.Key = this.request.body.Key.startsWith('/') ? this.request.body.Key.slice(1) : this.request.body.Key;
	}

	protected async hideRequestedFolder()
	{
		console.log(`Hide Folder: Hiding the requested folder: '${this.request.body.Key}'...`);
		const res = (await this.hideFolders([this.request.body.Key]))[0];
		if(res.status === 'fulfilled')
		{
			console.log(`Hide Folder: Succeeded hiding the requested folder.`);
			return res.value
		}
		else{
			console.error(`Hide Folder: Failed hiding the requested folder: ${res.reason}`);
			throw new Error(res.reason)
		}
	}

	protected async hideSubtreeFolders()
	{
		console.log(`Hide Folder: Hiding folders in the subtree...`);
		
		let folders: any[] = [];

		do {
			// Get the subtree's folder' keys
			// Since each page's folder are deleted, there's no use in requesting different pages.
			folders = await this.getFoldersKeysPageFromSubtree();

			await this.hideFolders(folders);
		}
		while (folders.length > 0);
		
		console.log(`Hide Folder: Done hiding the subtree's folders.`);
	}

	private async hideFolders(folderKeys: any[])
	{
		const existingFile = {doesFileExist: true};
		return await Promise.allSettled(folderKeys.map(folderKey => (async () => 
		{
			const newFileFields =  {
				Key: folderKey,
				DeletedBy: this.request.body.Key,
				Hidden: true,
			};
			return await this.pfsMutator.mutateADAL(newFileFields, existingFile);
		})()));
	}

	private async getFoldersKeysPageFromSubtree()
	{

		const whereClause = 'MIME = "pepperi/folder"';
		return await this.getObjectsKeysFromSubtree(whereClause);
	}

	protected async getObjectsKeysFromSubtree(whereClause: string)
	{
		const requestCopy = { ...this.request };
		// Get the objects whose Folder starts with the requested folder
		requestCopy.query.where = `Folder like "${this.request.body.Key}%" AND ${whereClause}`;
		// Retrieve only the Key property, saving memory
		requestCopy.query.fields = "Key";

		return (await (new ListObjectsCommand(this.client, requestCopy, this.pfsMutator, this.pfsGetter)).execute()).map(resObj => resObj.Key);
	}

    // async unlock(key: string): Promise<void>{
    //     await this.pfsMutator.unlock(key);
    // }
}
