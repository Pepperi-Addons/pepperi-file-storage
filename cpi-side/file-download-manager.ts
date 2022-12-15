import fetch from "node-fetch";
import fs from "fs";
import { URL } from "url";
import PQueue from 'p-queue';
import { AddonFile } from "@pepperi-addons/papi-sdk";

declare global {
    //  for singleton
    var fms: FileDownloadManager;
}
export class FileDownloadManager {
    

    static get instance(): FileDownloadManager {
        if (!global.fms) {
            global.fms = new FileDownloadManager();
        }
        return global.fms;
    }

    filesQueue: PQueue;
    constructor() {
        this.filesQueue = new PQueue({ concurrency: this.downloadConcurrency });
    }
    private _fileStatus: FileStatus | undefined;
    get filesStatuses () {
        return (async () => {
            if (!this._fileStatus) {
                this._fileStatus = await this.getFileStatus();
            }
            return this._fileStatus;            
        })();     
    }

    private _pfsFolder = '';
    get pfsFolder() {
        return (async () => {
            if (!this._pfsFolder) {
                this._pfsFolder = await this.getPFSFolder();
            }
            return this._pfsFolder;
        })();
    }

    // amount of files to download at once
    private readonly downloadConcurrency: number = 10;

    rebuild() {
        // rebuild pfs folder - setting to undefined will create the folder if it doesn't exist
        this._pfsFolder = '';
        // rebuild file status - setting to undefined will force to load files statuses from disk if exists
        this._fileStatus = undefined;
    }       

    downloadFiles(files: AddonFile[]) {
        // add download function to queue for each file
        this.filesQueue.addAll(files.map(file => {
            return () => this.downloadFileToDeviceIfNeeded(file);
        }));       
    }
    
    // download files that failed to download (e.g. due to network error)
    async downloadFailedFiles() {
        const filesStatuses = await this.filesStatuses;
        const failedFiles = Object.keys(filesStatuses.files).filter(fileStatusKey => filesStatuses.files[fileStatusKey].status === 'error');
        if (failedFiles.length > 0) {
            console.log(`Downloading ${failedFiles.length} files that failed to download`);
            return this.downloadFiles(failedFiles.map(fileStatusKey => {
                const file = filesStatuses.files[fileStatusKey] as FileStatusItem;
                return {
                    Name: file.fileName,
                    URL: file.fileURL,
                };
            }));
        }
    }

    /**
     * Given a file, download it if it wasn't already downloaded or is outdated
     * @param file the file to download
     * @returns the path to the locally saved file data.
     */
    async downloadFileToDeviceIfNeeded(file: AddonFile): Promise<string> {
        let fileLocalPath = '';
        if(file.MIME === 'pepperi/folder')
        {
            return fileLocalPath;
        }
        
        const filesStatuses = await this.filesStatuses;

        // Get this file's status from filesStatuses
        const { hostname, pathname } = new URL(file.URL!);
        const fixedPathName = pathname.substring(pathname.slice(1).indexOf('/') + 1); // remove distributor uuid from path

        const fileStatus = filesStatuses.files[fixedPathName];

        const isFileDownloaded = fileStatus?.status === 'downloaded';
        const isFileVersionMatched = fileStatus?.fileVersion === file.FileVersion;

        fileLocalPath = fixedPathName;
        // 1. file is already downloaded and version is ok
        if (isFileDownloaded && isFileVersionMatched) { 
            console.log(`File ${file.Name} is up to date`);
            return fileLocalPath;
        }
        // 2. file is not downloaded or version changed
        const pfsRootDir = await this.pfsFolder;
        try {
            await this.downloadFile(file, fixedPathName, pfsRootDir);     
            // 3. download was successful
            await this.updateFileStatusItem(fixedPathName, 'downloaded', file)
            console.log(`File ${file.Name} downloaded from PFS`);
               
        } catch (error) {
            // 4. download failed
            await this.updateFileStatusItem(fixedPathName, 'error', file, error)
            console.log(`Error downloading PFS file ${file.Name}`);
            fileLocalPath = '';
        }

        return fileLocalPath;
    }

    downloadFile(file: AddonFile, destPath: string,  pfsRootDir: string): Promise<void> {
        const filePath = `${pfsRootDir}/${destPath}`
        console.log(`Downloading file ${file.Name} from ${file.URL} to ${filePath}`);

        return new Promise((resolve, reject) => {
            fetch(file.URL!).then(res => res.buffer()).then(buffer => {
                // write file to disk
                const dir = filePath.substring(0, filePath.lastIndexOf('/'));
                // create dir if needed
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                return fs.promises.writeFile(filePath, buffer);
            }).then(() => {
                console.log(`Downloaded file ${filePath}`);
                resolve();
            }).catch(err => {
                console.log(err);
                reject(err);
            });
        });        
    }    

    private async getFileStatus(): Promise<FileStatus>  {
        const fileStatusPath = `${await this.pfsFolder}/file-status.json`;
        if (!fs.existsSync(fileStatusPath)) {
            fs.writeFileSync(fileStatusPath, JSON.stringify({
                files: {},
            } as FileStatus));   
        }
        const fileStatus = JSON.parse(fs.readFileSync(fileStatusPath).toString());
        return fileStatus;
    }

    async getPFSFolder(): Promise<any> {
        const filesRootDir = await pepperi.files.rootDir();
        const pfsRootDir = `${filesRootDir}/PFS`;
        if (!fs.existsSync(pfsRootDir)) {
            fs.mkdirSync(pfsRootDir);
        }
        return pfsRootDir;
    }

    private async updateFileStatusItem(filePath: string, status: DownloadStatus, file: AddonFile, error: any = '') {
        let statusItem = {} as FileStatusItem;
        switch (status) {
            case 'downloaded':
                statusItem = {
                    status: status,
                    downloadedDateTime: Date.now(),
                    modificationDateTime: parseInt(file.ModificationDateTime!),
                    fileVersion: file.FileVersion,
                    fileURL: file.URL,
                    fileName: file.Name,
                }  
                break;
            case 'error':
                statusItem = {
                    status: 'error',
                    error: `${error}`,
                    downloadedDateTime: Date.now(),
                    fileURL: file.URL,
                    fileName: file.Name,
                }
                break;
            }
        // save file status
        await this.updateFileStatus(filePath, statusItem);        
    }

    private async updateFileStatus(fileStatusKey: string, status: FileStatusItem) {
        // update global files statuses
        const filesStatuses = await this.filesStatuses;
        filesStatuses.files[fileStatusKey] = status;  
        // save on disk asynchronously
        const fileStatusPath = `${await this.pfsFolder}/file-status.json`;
        fs.writeFile(fileStatusPath, JSON.stringify(filesStatuses), 'utf8', (err) => {
            if (err) {
                console.log(`Error saving file status to ${fileStatusPath}`);
            } else {
                console.log(`File status updated for ${fileStatusKey}`);
            }

        });
    }
}

export type DownloadStatus = 'downloading' | 'downloaded' | 'error';
export interface FileStatusItem {    
        status: DownloadStatus;
        error?: string;
        downloadedDateTime?: number;
        modificationDateTime?: number;
        fileVersion?: string,
        fileURL?: string;
        fileName?: string;
}
export interface FileStatus {
    files: { [key: string]: FileStatusItem };
} 