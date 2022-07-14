import { Helper } from "../../../helper";
import { SECRETKEY_HEADER } from "../../../constants";
import { BaseRollbackAlgorithm } from "./baseRollback";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import config from '../../../../addon.config.json';
import { v4 as uuid } from 'uuid';

export class HideFolderRollbackAlgorithm extends BaseRollbackAlgorithm 
{
    async rollbackImplementation(): Promise<void>
    {
        this.rollbackLogger();

		// We should actually call the async endpoint
		// await (new HideFolderTransactionalCommand(this.client, this.request, this.pfsMutator, this.pfsGetter)).execute();
		const lowerCaseHeader = Helper.getLowerCaseHeaders(this.request.header);
		const papiClient: PapiClient = Helper.createPapiClient(this.client, this.AddonUUID, lowerCaseHeader[SECRETKEY_HEADER]);

		// Create a rollbackUUID
		const rollbackUUID = uuid();
		// Add the rollbackUUID to the lock record
		if(this.lockedFile.rollbackUUID)
		{
			throw new Error(`The locked file already has a rollbackUUID: ${this.lockedFile.rollbackUUID}`);
		}
		else
		{
			this.lockedFile.rollbackUUID = rollbackUUID;
			await this.pfsMutator.setRollbackData(this.lockedFile);
	
			// Since this unlocking a HideFolder transaction is an async operation,
			// and we might get here through a regular synchroneous request, we should
			// create a new async call, and throw an exception with the ActionUUID.
			const numberOfRetries = 3;

			//TODO: Once we have an nginx routing for the endpoint we should change this line
			const url = `addons/api/async/${config.AddonUUID}/api/hide_folder?Key=${this.request.query.Key}&resource_name=${this.request.query.resource_name}&addon_uuid=${this.request.query.addon_uuid}&retry=${numberOfRetries}`;
			const params = {method: 'POST', headers: this.request.header, body: JSON.stringify({rollbackUUID: rollbackUUID})};
			const res = await papiClient.post(url, params);
	
			throw new Error('Rollback has been called, but the async operation has not finished yet. For further information see: ' + res);
		}
    }
}