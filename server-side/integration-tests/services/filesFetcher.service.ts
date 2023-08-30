import { BaseService } from "@pepperi-addons/addon-testing-framework";
import fetch from "node-fetch";

export class FilesFetcherService extends BaseService
{
    public async downloadFile(url: string): Promise<Buffer>
    {
        const response = await fetch(url, { method: `GET` });
        const arrayData = await response.arrayBuffer();
        const buf = Buffer.from(arrayData);
        return buf;
    }
}