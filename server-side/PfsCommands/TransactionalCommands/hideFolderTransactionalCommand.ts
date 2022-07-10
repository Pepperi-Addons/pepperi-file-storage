import { TestError } from "../../constants";
import { Helper } from "../../helper";
import { ABaseTransactionalCommand } from "./aBaseTransactionalCommand";

export class HideFolderTransactionalCommand extends ABaseTransactionalCommand{

	async preLockValidations() 
	{
		// Validate secret key
		await Helper.validateAddonSecretKey(this.request.header, this.client, this.AddonUUID);

		// Validate that the folder exists
		await this.validateFolder();
	}

	/**
	 * Throws an error if the folder does not exist or is already hidden.
	 */
	private async validateFolder() {
		this.request.query.key = this.request.query.key.startsWith('/') ? this.request.query.key.slice(1) : this.request.query.key;
		this.request.query.key = this.request.query.key.endsWith('/') ? this.request.query.key : `${this.request.query.key}/`;
		await this.getCurrentItemData();

		if (!this.existingFile.doesFileExist) {
			console.log(`${this.request.query.key} does not exist`);
		}
	}

    async lock(): Promise<void>{
		await super.performRollback();

		await this.pfsMutator.lock(this.request.body.Key, "hide");
    }

    async executeTransaction(): Promise<any>{
       //TODO implement.
    }

    async unlock(key: string): Promise<void>{
        await this.pfsMutator.unlock(key);
    }
}