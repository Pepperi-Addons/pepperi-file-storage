import { v4 as createUUID } from 'uuid';
import jwtDecode from 'jwt-decode';
import { URL } from 'url';

export default class TempFileService {
    protected distributorUUID: string;

    constructor(protected OAuthAccessToken) 
    {
        this.distributorUUID = jwtDecode(OAuthAccessToken)['pepperi.distributoruuid'];
    }

    /**
	 * Create a temp file full path by its name
	 * @param tempFileName the temp file name
	 * @returns a string in the format temp/${DistributorUUID}/{{randomUUID}}/${tempFileName}
	 */
	 public createTempFileFullPath(tempFileName: string): string
	 {
		return `temp/${this.distributorUUID}/${createUUID()}/${tempFileName? tempFileName : createUUID()}`;
	 }
 
	 /**
	  * Returns wether or not a given URL belongs to a temp file
	  * @param {string} url the URL to check
	  * @returns {boolean} true if the URL belongs to a temp file, false otherwise
	  */
	 public isTempFile(url: string): boolean
	 {
		 let res = true;
 
		 const tempFilePrefix = `/temp/${this.distributorUUID}/`;
		 let urlObject: URL;
		 try
		 {
			 // Create a URL object from the given URL string
			 urlObject = new URL(url);
 
			 // Get the path from the URL object
			 const path = urlObject.pathname;
 
			 // Check if the path starts with the temp file prefix
			 res = path.startsWith(tempFilePrefix);
		 }
		 catch
		 {
			 res = false;
		 }
		 
		 return res;

	 }
}
