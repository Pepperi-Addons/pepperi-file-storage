import { Helper } from "../../helper";
import { ABaseHideFolderTransactionalCommand } from "./aBaseHideFolderTransactionalCommand";

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
		const asyncCall = await Helper.createPapiClient(this.client, this.client.AddonUUID, this.client.AddonSecretKey).post(`/api/addons/async/${this.client.AddonUUID}/api/hide_folder?retry=${this.ASYNC_HIDE_FOLDER_RETRY}`, this.request);
		console.log(`Continuing to hide files and folders in folder '${this.request.body.Key}' in ExecutionUUID: ${asyncCall?.ExecutionUUID}`);

		return hideFolderRes;
    }	
}
