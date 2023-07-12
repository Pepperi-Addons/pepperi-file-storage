import { ABaseTransactionalCommand } from "./aBaseTransactionalCommand";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import { ListObjectsCommand, TransactionType } from "pfs-shared";
import { ServerHelper } from "../../serverHelper";

export class HideFolderTransactionalCommand extends ABaseTransactionalCommand
{

	readonly TRANSACTION_TYPE: TransactionType = "hide" ;
	protected isRollbackRequested = false;

	async preLockLogic() 
	{
		await this.preLockValidations();

	}

	private async preLockValidations()
	{
		// Validate secret key
		await ServerHelper.validateAddonSecretKey(this.request.header, this.client, this.AddonUUID);

		// Validate that the folder exists or that there's a 'hide' lock on it.
		await this.validateFolder();

		this.isRollbackRequested = await this.getIsRollbackRequested();
	}
	
	private async getIsRollbackRequested()
	{
		let isRollbackRequested = !!this.request.body?.rollbackUUID;
		let lockedFile: any;

		if(this.request.body.rollbackUUID && isRollbackRequested)
		{
			lockedFile = await this.pfsMutator.isObjectLocked(this.request.query.Key);
			isRollbackRequested = isRollbackRequested && lockedFile?.rollbackUUID;

			if(isRollbackRequested)
			{
				isRollbackRequested = isRollbackRequested && lockedFile.rollbackUUID === this.request.body.rollbackUUID;
			}
			else
			{
				throw new Error(`Another rollback is already running on key '${this.request.query.Key}'`);
			}
		}

		return isRollbackRequested;
	}

	/**
	 * Throws an error if (the folder does not exist or is already hidden) and if (there's no 'hide' lock on it).
	 */
	private async validateFolder()
	{
		this.request.query.Key = this.request.query.Key.startsWith("/") ? this.request.query.Key.slice(1) : this.request.query.Key;
		this.request.query.Key = this.request.query.Key.endsWith("/") ? this.request.query.Key : `${this.request.query.Key}/`;
		await this.getCurrentItemData();
		
		if (!this.existingFile.doesFileExist)
		{
			const lockedObject = await this.pfsMutator.isObjectLocked(this.request.query.Key);
			// We run the transaction if the folder does not exist, but there's a 'hide' lock on it, and a rollbackUUID is provided.
			// We check if the rollbackUUID in the request's body matches the one on the lock, to ensure a single rollback is run.
			// This allows us to use the function itself as its own rollback.
			if(!(lockedObject?.transactionType === "hide" && this.request.body?.rollbackUUID === lockedObject?.rollbackUUID))
			{
				console.log(`${this.request.query.Key} does not exist`);
				throw new Error(`${this.request.query.Key} does not exist`);
			}
		}
	}

	async lock(): Promise<void>
	{
		// If a rollback is requested, there's no need to lock the file.
		// A lock is already in place.
		if(!this.isRollbackRequested)
		{
			await super.rollback();

			await this.pfsMutator.lock(this.request.query.Key, this.TRANSACTION_TYPE);
		}
	}

	async executeTransaction(): Promise<any>
	{	
		// First, hide the requested folder, to prevent it from being visible in the UI.
		await this.hideRequestedFolder();

		// Then, delete all files and folders inside the requested folder.
		// It should be possible to hide the files and folder concurrently, but for simplicity and readability, we'll do it sequentially.
		await this.hideSubtreeFiles();
		await this.hideSubtreeFolders();
	}

	/**
	 * Hides the requested folder.
	 */
	async hideRequestedFolder()
	{
		await this.hideFolders([this.request.query.Key]);
	}

	private async hideSubtreeFiles()
	{
		let filesKeys: any[] = [];

		do 
		{
			// Get the subtree's files' keys
			// Since each page's files are deleted, there's no use in requesting different pages.
			filesKeys = await this.getSubtreeFilesKeys();

			// Hide the files using pfs batch operation.
			// We use this since it updates the UploadedBy field and actually deletes the file from S3.
			await this.hideObjectsUsingPfsBatchDisregardingExistingLocks(filesKeys);

		}
		while (filesKeys.length > 0);
	}

	private async getSubtreeFilesKeys()
	{
		const whereClause = 'MIME != "pepperi/folder"';
		return await this.getObjectsKeysFromSubtree(whereClause);
	}

	private async hideSubtreeFolders()
	{
		let folders: any[] = [];

		do 
		{
			// Get the subtree's folder' keys
			// Since each page's folder are deleted, there's no use in requesting different pages.
			folders = await this.getFoldersKeysPageFromSubtree();

			await this.hideFolders(folders);
		}
		while (folders.length > 0);
	}

	private async hideFolders(folderKeys: any[])
	{
		const existingFile = {doesFileExist: true};
		return await Promise.allSettled(folderKeys.map(folderKey => (async () => 
		{
			const newFileFields =  {
				Key: folderKey,
				DeletedBy: this.request.query.Key,
				Hidden: true,
			};
			await this.pfsMutator.mutateADAL(newFileFields, existingFile);
		})()));
	}

	private async getFoldersKeysPageFromSubtree()
	{

		const whereClause = 'MIME = "pepperi/folder"';
		return await this.getObjectsKeysFromSubtree(whereClause);
	}

	private async getObjectsKeysFromSubtree(whereClause: string)
	{
		const requestCopy = { ...this.request };
		// Get the objects whose Folder starts with the requested folder
		requestCopy.query.where = `Folder like "${this.request.query.Key}%" AND ${whereClause}`;
		// Retrieve only the Key property, saving memory
		requestCopy.query.fields = "Key";

		return (await (new ListObjectsCommand(requestCopy, this.pfsMutator, this.pfsGetter)).execute()).map(resObj => resObj.Key);
	}

	private async hideObjectsUsingPfsBatchDisregardingExistingLocks(filesKeys: any) 
	{
		const lowerCaseHeaders = ServerHelper.getLowerCaseHeaders(this.request.header);
		const papiClient: PapiClient = ServerHelper.createPapiClient(this.client, this.AddonUUID, lowerCaseHeaders["x-pepperi-secretkey"]);

		filesKeys = filesKeys.map(fileKey => 
		{
			return {
				Key: fileKey,
				DeletedBy: this.request.query.Key,
				Hidden: true,
			};
		});

		// Unlock any locked objects before hiding them
		await Promise.allSettled(filesKeys.map(fileKey => (async () => 
		{
			await this.pfsMutator.unlock(fileKey);
		})()));
		// Hide the objects using pfs batch operation.
		return await papiClient.addons.data.import.uuid(this.AddonUUID).table(this.request.query.resource_name).upsert({Objects: filesKeys});
	}

	async unlock(key: string): Promise<void>
	{
		await this.pfsMutator.unlock(key);
	}
}
