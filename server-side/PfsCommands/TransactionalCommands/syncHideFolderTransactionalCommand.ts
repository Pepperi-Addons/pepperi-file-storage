import { Helper } from "../../helper";
import { ABaseHideFolderTransactionalCommand } from "./aBaseHideFolderTransactionalCommand";
import { AsyncHideFolderTransactionalCommand } from "./asyncHideFolderTransactionalCommand";

export class SyncHideFolderTransactionalCommand extends ABaseHideFolderTransactionalCommand{
	
	public async preLockLogic()
	{
		// Validate secret key
		await Helper.validateAddonSecretKey(this.request.header, this.client, this.AddonUUID);

		await this.canonizeFolderKey();
	}

	public async lock(): Promise<void>
	{
		await super.rollback();

		await this.pfsMutator.lock(this.request.body.Key, this.TRANSACTION_TYPE, this.client.ActionUUID);
	}

    async executeTransaction(): Promise<any>
	{	
		// First, hide the requested folder, to prevent it from being visible in the UI.
		const hideFolderRes = await this.hideRequestedFolder();

		// Call the async method to hide all the files and subfolders in the folder.
		const papiClient = Helper.createPapiClient(this.client, this.client.AddonUUID, this.client.AddonSecretKey);
		const url = `/addons/api/async/${this.client.AddonUUID}/api/hide_folder?addon_uuid=${this.request.query.addon_uuid}&resource_name=${this.request.query.resource_name}&retry=${this.ASYNC_HIDE_FOLDER_RETRY}`;
		const asyncCall = await papiClient.post(url, this.request.body);
		console.log(`Continuing to hide files and folders in folder '${this.request.body.Key}' in ExecutionUUID: ${asyncCall?.ExecutionUUID}`);

		// // Locally call AsyncHideFolderTransactionalCommand for debug:
		// await (new AsyncHideFolderTransactionalCommand(this.client, this.request, this.pfsMutator, this.pfsGetter)).execute();

		return hideFolderRes;
    }

	async unlock(key: string): Promise<void>{
        // Since the transaction isn't over by the time the SyncHideFolder
		// is done executing (we're still waiting for the AsyncHideFolder
		// to run), we do not unlock in the SyncHideFolder.

		// It is up to AsyncHideFolder to unlock the transaction.
    }
}
