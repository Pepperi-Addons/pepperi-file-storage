import { Client } from "@pepperi-addons/debug-server/dist";
import { PapiClient } from "@pepperi-addons/papi-sdk"

export class PapiClientBuilder
{
    constructor()
    {}

    public build(client: Client, addonUUID: string, secretKey = "", keepActionUUID = true): PapiClient
    {
        return new PapiClient({
			baseURL: client.BaseURL,
			token: client.OAuthAccessToken,
			addonUUID: addonUUID,
			...(keepActionUUID && {actionUUID: client.ActionUUID}),
			...(secretKey && {addonSecretKey: secretKey})
		});
    }
}