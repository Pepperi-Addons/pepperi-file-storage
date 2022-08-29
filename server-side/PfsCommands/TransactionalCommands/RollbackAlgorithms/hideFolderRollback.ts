import { Helper } from "../../../helper";
import { SECRETKEY_HEADER } from "../../../constants";
import { BaseRollbackAlgorithm } from "./baseRollback";
import { PapiClient } from "@pepperi-addons/papi-sdk";
import config from '../../../../addon.config.json';

export class HideFolderRollbackAlgorithm extends BaseRollbackAlgorithm 
{
    async rollbackImplementation(): Promise<void>
    {
        this.rollbackLogger();

		const lowerCaseHeader = Helper.getLowerCaseHeaders(this.request.header);
		const papiClient: PapiClient = Helper.createPapiClient(this.client, this.AddonUUID, lowerCaseHeader[SECRETKEY_HEADER]);

		const numberOfRetries = 3;

		const url = `/addons/api/async/${config.AddonUUID}/api/hide_folder?resource_name=${this.request.query.resource_name}&addon_uuid=${this.request.query.addon_uuid}&retry=${numberOfRetries}${this.request.query.forceRollback ? `&${this.request.query.forceRollback}`:''}`;
		const body = {Key: this.request.body.Key};
		const params = {method: 'POST', headers: this.request.header};
		const res = await papiClient.post(url, body, params);

		throw new Error('Rollback has been called, but the async operation has not finished yet. For further information see: ' + JSON.stringify(res));
    }
}
