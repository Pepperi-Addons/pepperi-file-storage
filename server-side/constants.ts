export const S3Buckets = {
	"prod": "pepperi-file-storage",
	"sandbox": "staging-pepperi-file-storage",
	"eu": "eu-pepperi-file-storage",
	"dev": "pepperi-file-storage-dev"
}

export const CdnServers = {
	"prod": "pfs.pepperi.com",
	"sandbox": "pfs.staging.pepperi.com",
	"eu": "pfs.eu.pepperi.com",
	//The next entry is just a placeholder, not a real CDN.
	"dev": "pfs.dev.pepperi.com"
}

export interface IPfsDownloadObjectResponse{
    Key: string,
    Name: string,
    Folder: string,
    Sync: "None" | "Device" | "DeviceThumbnail" | "Always",
    MIME: string,
    URL: String,
	Hidden: boolean,
	Description?: string
}