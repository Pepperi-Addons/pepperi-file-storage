import fetch from "node-fetch";
import fs from "fs";
import { URL } from "url";
 
export class FileDownloadManager {

    private _fileStatus: FileStatus | undefined;
    get fileStatus () {
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
    private readonly filesToDownloadAtOnce: number = 10;
    // flag to indicate if download is available
    private isDownloadAvailable: boolean = true;


    //  singleton
    private static instance: FileDownloadManager;    
    public static getInstance(): FileDownloadManager {
        if (!FileDownloadManager.instance) {
            FileDownloadManager.instance = new FileDownloadManager();
        }
        return FileDownloadManager.instance;
    }


    // download files in bulks of `filesToDownloadAtOnce` files at once
    downloadFiles(files: any[]): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (!this.isDownloadAvailable) {
                reject(new Error('File download is not available'));
            }
            for (let i = 0; i < files.length; i += this.filesToDownloadAtOnce) {
                const endBulkIndex = i + this.filesToDownloadAtOnce > files.length ? undefined : i + this.filesToDownloadAtOnce; // If end is undefined, then the slice extends to the end of the array (From slice docs).
                const filesToDownload = files.slice(i, endBulkIndex);
                await Promise.all(filesToDownload.map(async file => {
                    return this.downloadFileIfNeeded(file);                    
                }));
            }            
            resolve();
        });        
    }

        
    async downloadFileIfNeeded(file: any): Promise<string> {
        const { hostname, pathname } = new URL(file.URL);
        const fileStatus = await this.fileStatus;
        const fixedPathname = pathname.substring(pathname.slice(1).indexOf('/') + 1); // remove account uuid from path
        let retFilePath = fixedPathname;
        const fileStatusItem = fileStatus.files[fixedPathname];
        const isFileDownloaded = fileStatusItem && fileStatusItem.status === 'downloaded';
        const isFileVersionMatched = fileStatusItem && fileStatusItem.fileVersion === file.FileVersion;
        // 1. file is already downloaded and version is ok
        if (isFileDownloaded && isFileVersionMatched) { 
            console.log(`File ${file.Name} is up to date`);
            return retFilePath;
        }
        // 2. file is not downloaded or version changed
        const pfsRootDir = await this.pfsFolder;
        try {
            await this.downloadFile(file, fixedPathname, pfsRootDir);     
            // 3. download was successful
            await this.updateFileStatusItem(fixedPathname, 'downloaded', file)
            console.log(`File ${file.Name} downloaded from PFS`);
               
        } catch (error) {
            // 4. download failed
            await this.updateFileStatusItem(fixedPathname, 'error', file, error)
            console.log(`Error downloading PFS file ${file.Name}`);
            retFilePath = '';
        }
        return retFilePath;
    }

    downloadFile(file: any, destPath: string,  pfsRootDir: string): Promise<void> {
        const filePath = `${pfsRootDir}/${destPath}`
        console.log(`Downloading file ${file.Name} from ${file.URL} to ${filePath}`);
        
        return new Promise((resolve, reject) => {
            fetch(file.URL).then(res => res.buffer()).then(buffer => {
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
        const filesRootDir = await pepperi["files"].rootDir();
        const pfsRootDir = `${filesRootDir}/PFS`;
        if (!fs.existsSync(pfsRootDir)) {
            fs.mkdirSync(pfsRootDir);
        }
        return pfsRootDir;
    }

    private async updateFileStatusItem(filePath: string, status: DownloadStatus, file: any, error: any = '') {
        let statusItem = {} as FileStatusItem;
        switch (status) {
            case 'downloaded':
                statusItem = {
                    status: status,
                    downloadedDateTime: Date.now(),
                    modificationDateTime: file.ModificationDateTime,
                    fileVersion: file.FileVersion,
                    fileURL: file.URL,
                }  
                break;
            case 'error':
                statusItem = {
                    status: 'error',
                    error: `${error}`,
                    downloadedDateTime: Date.now(),
                    fileURL: file.URL,
                }
                break;
            }
        // save file status
        await this.updateFileStatus(filePath, statusItem);        
    }

    private async updateFileStatus(fileStatusKey: string, status: FileStatusItem) {
        // update global file status
        const fileStatus = await this.fileStatus;
        fileStatus.files[fileStatusKey] = status;  
        // save on disk asynchronously
        const fileStatusPath = `${await this.pfsFolder}/file-status.json`;
        fs.writeFile(fileStatusPath, JSON.stringify(fileStatus), 'utf8', (err) => {
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
}
export interface FileStatus {
    files: { [key: string]: FileStatusItem };
} 