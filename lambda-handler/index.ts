import {ExecuteAddonSync} from '@pepperi-addons/addon-infra-sdk/build/src/pepperi-lambda-handler/addons-index';
export async function handler(event: any, context: any): Promise<any>
{
    return await ExecuteAddonSync(event, context);
}