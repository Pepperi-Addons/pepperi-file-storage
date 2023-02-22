import { PapiClient } from "@pepperi-addons/papi-sdk";
import { ABaseTransactionalCommand } from "../aBaseTransactionalCommand";
import { ServerHelper } from '../../../serverHelper';
import { IPfsGetter, IPfsMutator, PostService, TransactionType } from 'pfs-shared';
import { Client, Request } from '@pepperi-addons/debug-server/dist';
import { OnlinePostService } from "./onlinePostService";

export class PostTransactionalCommand extends ABaseTransactionalCommand{
	readonly MIME_FIELD_IS_MISSING = "Missing mandatory field 'MIME'";
	readonly TRANSACTION_TYPE: TransactionType = 'post' ;

	protected postService: PostService;

	constructor(client: Client, protected papiClient: PapiClient, request: Request, pfsMutator: IPfsMutator, pfsGetter: IPfsGetter) {
		super(client, request, pfsMutator, pfsGetter);

		this.postService = new OnlinePostService(this.papiClient, this.client.OAuthAccessToken, this.request, this.pfsMutator, this.pfsGetter);
	}
	async preLockLogic() 
	{
		await ServerHelper.validateAddonSecretKey(this.request.header, this.client, this.AddonUUID);

		this.postService.validatePostRequest();
	}

    async lock(): Promise<void>
	{
        await super.rollback();

		await this.pfsMutator.lock(this.request.body.Key, this.TRANSACTION_TYPE);
    }

    async executeTransaction(): Promise<any>
	{
        // Download the current saved metadata, if exists
		await this.postService.getCurrentItemData();

		// Further validation of input
		await this.postService.validateFieldsForUpload();

		// Save the currently saved metadata on the lock - will be used for rollback purposes
		await this.pfsMutator.setRollbackData(this.postService.existingFile);

		// Commit changes to S3 and ADAL metadata table
		const res: any = await this.postService.mutatePfs();

		// Publish notification to subscribers
		await this.pfsMutator.notify(this.newFileFields, this.existingFile);

		return res;
    }

    async unlock(key: string): Promise<void>{
        await this.pfsMutator.unlock(key);
    }
}
