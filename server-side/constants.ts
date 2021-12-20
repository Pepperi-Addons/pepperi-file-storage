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
	"dev": "d3jagocnvgzx6w.cloudfront.net"
}

export interface IPfsDownloadObjectResponse{
    Key: string,
    Name: string,
    Folder: string,
    Sync: "None" | "Device" | "DeviceThumbnail" | "Always",
    MIME: string,
    URL: string,
	Hidden: boolean,
    CreationDateTime: string,
	Description?: string
}

export interface IPfsListFilesResultObject{
    Key: string,
    Name: string,
    Folder:string,
    URL?: string, // Folders don't have a URL, only files do.
    MIME?: string, // Folders return a MIME of type "pepperi/folder"
    ModificationDateTime?: string // Folders don't have a ModificationDateTime, only files do.
}

export type IPfsListFilesResultObjects = Array<IPfsListFilesResultObject>