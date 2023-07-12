import { PfsService as SharedPfsService } from "pfs-shared";

declare global {
    //  for singleton
    var downloadedFileKeysToLocalUrl: Map<string, string>;
}

export abstract class PfsService extends SharedPfsService
{
	static get downloadedFileKeysToLocalUrl(): Map<string, string>
	{
		if (!global.downloadedFileKeysToLocalUrl) 
		{
			global.downloadedFileKeysToLocalUrl = new Map<string, string>();
		}

		return global.downloadedFileKeysToLocalUrl;
	}
}
