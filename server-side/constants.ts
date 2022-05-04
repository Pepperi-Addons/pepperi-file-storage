export const S3Buckets = {
	"prod": "pepperi-file-storage",
	"sandbox": "staging-pepperi-file-storage",
	"eu": "eu-pepperi-file-storage",
	"dev": "pepperi-file-storage-dev"
}

export const CdnServers = {
	"prod": "https://pfs.pepperi.com",
	"sandbox": "https://pfs.staging.pepperi.com",
	"eu": "https://eupfs.pepperi.com",
	//The next entry is just a placeholder, not a real CDN.
	"dev": "https://d3jagocnvgzx6w.cloudfront.net"
}

export const CloudfrontDistributions = {
	"prod": "EZ8RY7SWZ0ZA0",
	"sandbox": "E1JOFJL0PE5DBS",
	"eu": "E1R0ITT15925AL",
	//The next entry is just a placeholder, not a real CDN.
	"dev": "E3VND838PBH3CH"
}

export interface IPfsDownloadObjectResponse {
    Key: string,
    Name: string,
    Folder: string,
    Sync: "None" | "Device" | "DeviceThumbnail" | "Always",
    MIME: string,
    URL: string,
    Hidden: boolean,
    CreationDateTime: string,
    ModificationDateTime: string,
	Description?: string,
    PresignedURL?: string
}

export interface IPfsListFilesResultObject {
    Key: string,
    Name: string,
    Folder: string,
    URL?: string, // Folders don't have a URL, only files do.
    MIME?: string, // Folders return a MIME of type "pepperi/folder"
    ModificationDateTime?: string // Folders don't have a ModificationDateTime, only files do.
}

export const pfsSchemeData: any = {
	Type: 'indexed_data',
	Fields: {
		Description: {
			Type: 'String',
			// Indexed: true // Description field is defined optional, while the currently used indexed_data tabke doesn't support an empty value indexed key. 
							 // Until a solution is found, this field cannot be indexed.
		},
		// ModificationDateTime:{
		// 	Type: "Integer",
		// 	Indexed: true // Indexing Date fields is currntly buggy in ADAL. 
		// },
		MIME: {
			Type: 'String',
			Indexed: true
		},
		Sync: {
			Type: 'String',
		},
		Thumbnails: {
			Type: 'String'
		},
		Folder: {
			Type: 'String',
			Indexed: true
		},
		Name: {
			Type: 'String'
		},
		URL: {
			Type: 'String'
		},
		FileVersion: {
			Type: 'String'
		},
		Cache: {
			Type: 'Boolean'
		}
	} as any,
}

export  type IPfsListFilesResultObjects = Array<IPfsListFilesResultObject>

export const dataURLRegex = /^\s*data:([a-z]+\/[\w-+\d.]+(;[a-z\-]+\=[a-z\-]+)?)?(;base64)?,([a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*)$/i;

export const METADATA_ADAL_TABLE_NAME = "S3ObjectsMetadata";
export const LOCK_ADAL_TABLE_NAME = "PfsLockTable";

export const MAXIMAL_LOCK_TIME: number = 1000 * 60 * 5; // Set to 5 minutes.
export const DEBUG_MAXIMAL_LOCK_TIME = 1; // Debug

export const MAXIMAL_TREE_DEPTH = 5;

export const HIDDEN_DEFAULT_VALUE = false;
export const DESCRIPTION_DEFAULT_VALUE = "";
export const CACHE_DEFAULT_VALUE = true;
export const syncTypes = ["None", "Device", "DeviceThumbnail", "Always"];
export const SYNC_DEFAULT_VALUE = syncTypes[0];

export class TestError extends Error{};