import fetch from "node-fetch";

import fs from "fs";
import { AddonDataScheme } from "@pepperi-addons/papi-sdk";
import { URL } from "url";
class FilesService {

    async getFileUrl(addonUUID: string, fileKey: string): Promise<string> {
        const file = await this.getFile(fileKey, addonUUID);
        const filePath = await this.downloadFileIfNeeded(file)
        if(filePath){
            const baseURL = await pepperi["files"].baseURL()
            return `${baseURL}/PFS${filePath}`;
        } else {
            return file.URL;
        }
    }
   

    async downloadFiles(lastSyncDataTime: number) { 
        const files = await this.getFiles(lastSyncDataTime);
        console.log(`PFS - Found ${files.length} files to download`);
        await Promise.all(files.map(async file => {;
           return this.downloadFileIfNeeded(file);        
        }));
    }
    async downloadFileIfNeeded(file: any): Promise<string> {
        const { hostname, pathname } = new URL(file.URL);
        const fileStatus = await this.getFileStatus();
        const fixedPathname = pathname.substring(pathname.slice(1).indexOf('/') + 1); // remove account uuid from path
        let retFilePath = fixedPathname;
        const fileStatusItem = fileStatus.files[fixedPathname];
        const isFileDownloaded = fileStatusItem && fileStatusItem.status === 'downloaded';
        const isFileVersionMatched = fileStatusItem && fileStatusItem.fileVersion === file.FileVersion;
        const isFileExists = fs.existsSync(`${await this.getPFSFolder()}/${fixedPathname}`);
        // 1. file is already downloaded and version is ok
        if (isFileDownloaded && isFileVersionMatched && isFileExists) { 
            console.log(`File ${file.Name} is up to date`);
            return retFilePath;
        }
        // 2. file is not downloaded or version changed
        const pfsRootDir = await this.getPFSFolder();
        let status = {} as FileStatusItem;
        try {
            await this.downloadFile(file, fixedPathname, pfsRootDir);     
            // 3. download was successful
            status = {
                status: 'downloaded',
                downloadedDateTime: Date.now(),
                modificationDateTime: file.ModificationDateTime,
                fileVersion: file.FileVersion,
                fileURL: file.URL,
            }            
            console.log(`File ${file.Name} downloaded from PFS`);
               
        } catch (error) {
            // 4. download failed
            status = {
                status: 'error',
                error: `${error}`,
                downloadedDateTime: Date.now(),
                fileURL: file.URL,
            }
            console.log(`Error downloading PFS file ${file.Name}`);
            // 4.1. try to get chached file, if not exists, return empty string
            retFilePath = isFileExists ? fixedPathname : '';
        }
        // 5. save file status
        await this.updateFileStatus(fixedPathname, status);
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

    async getFile(key, addonUUID: string | undefined = undefined): Promise<any> {
        if(addonUUID){
            // get file directly from table
            const addonSchema = await this.getAddonSchema(addonUUID);
            if (addonSchema) {
                const file = await pepperi.api.adal.get({
                    addon: addonUUID,
                    table: addonSchema.Name,
                    key: key,
                });
                return file.object;
            }
        } else {
            // look in all schemas
            const files = await this.getFiles();
            const file = files.find(file => file.Key === key);
            return file;
        }
    }

    async getFiles(modificationDateTime: number = 0): Promise<any[]> {
        const schemes = await this.getSchemesToDownload();
        const pfsFiles = await Promise.all(schemes.map(async schema => {
            return (await pepperi.api.adal.getList({
                addon: schema["AddonUUID"],
                table: schema.Name,
            })).objects;
        })) as any[];
        const flatFiles = pfsFiles.flat();
        const res = flatFiles.filter(file => {
            if(
                file.MIME !== "pepperi/folder" 
                && new Date(file.ModificationDateTime).getTime() >= modificationDateTime
                && file.Sync == 'Device'
            ) {
                    return true;
                } else {
                    return false;
                }
            });
        return res;      
        
    }
    async getAddonSchema(addonUUID): Promise<AddonDataScheme> {
        const schemas = await this.getSchemas();
        return schemas.find(schema => schema.Type === 'pfs' && schema.AddonUUID === addonUUID);
    }
    async getSchemesToDownload(): Promise<AddonDataScheme[]> {
        // get schemas that its type is 'pfs'
        const schemas = await this.getSchemas();
        const schemesToDownload = schemas.filter(schema => schema.Type === 'pfs');
        // TODO for now download only Assets schema
        const res = schemesToDownload.filter(schema => schema.Name === 'Assets');     
        return res;
        
    }
    async getSchemas(): Promise<any[]> {
        const schemas = await pepperi.api.adal.getList({
            addon: '00000000-0000-0000-0000-00000000ada1',
            table: 'schemes',
        })
        return schemas.objects;
    }
    async getPFSFolder(): Promise<any> {
        const filesRootDir = await pepperi["files"].rootDir();
        const pfsRootDir = `${filesRootDir}/PFS`;
        if (!fs.existsSync(pfsRootDir)) {
            fs.mkdirSync(pfsRootDir);
        }
        return pfsRootDir;
    }

    async getFileStatus(): Promise<FileStatus>  {
        const fileStatusPath = `${await this.getPFSFolder()}/file-status.json`;
        if (!fs.existsSync(fileStatusPath)) {
            fs.writeFileSync(fileStatusPath, JSON.stringify({
                files: {},
            } as FileStatus));   
        }
        const fileStatus = JSON.parse(fs.readFileSync(fileStatusPath).toString());
        return fileStatus;
    }
    async updateFileStatus(fileKey: string, status: FileStatusItem) {
        const pfsRootDir = await this.getPFSFolder();
        const fileStatus = await this.getFileStatus();
        fileStatus.files[fileKey] = status; 
        fs.writeFileSync(`${pfsRootDir}/file-status.json`, JSON.stringify(fileStatus));
    }


}
export default FilesService;
export interface FileStatusItem {    
        status: 'downloading' | 'downloaded' | 'error';
        error?: string;
        downloadedDateTime?: number;
        modificationDateTime?: number;
        fileVersion?: string,
        fileURL?: string;
}
export interface FileStatus {
    files: { [key: string]: FileStatusItem };
}     
