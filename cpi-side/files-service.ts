import { AddonDataScheme, AddonFile } from "@pepperi-addons/papi-sdk";
import { FileDownloadManager } from "./file-download-manager";
import config from '../addon.config.json'

class FilesService {  
    
    private get fdm(): FileDownloadManager {
        return FileDownloadManager.instance;
    }  

    async getFileWithLocalizedUrl(addonUUID: string, schemaName: string, fileKey: string): Promise<AddonFile> {
        const file = await this.getFileFromTable(fileKey, addonUUID, schemaName);
        if (file) {
            const filePath = await this.fdm.downloadFileToDeviceIfNeeded(file)
            if(filePath){
                const baseURL = await pepperi.files.baseURL()
                file.URL = `${baseURL}/PFS${filePath}`;
            }

            return file;

        } else {
            throw new Error(`File ${fileKey} not found`);
        }
    }


    async downloadFiles(lastSyncDataTime: number) { 
        // download files that come after lastSyncDataTime
        console.log(`Downloading PFS files since ${new Date(lastSyncDataTime)}`);
        const files = await this.getFiles(lastSyncDataTime);
        console.log(`PFS - Found ${files.length} files to download`);
        if(lastSyncDataTime == 0) { // is resync
            this.fdm.rebuild(); // rebuild file download manager
        }

        return Promise.all([
            this.fdm.downloadFiles(files), // download new files
            this.fdm.downloadFailedFiles() // try to download failed files
        ]);
    }

    /**
     * Get's a file from the synced table
     * @param key the key of the file to get
     * @param addonUUID 
     * @param schemaName 
     * @returns AddonFile | undefined
     */
    async getFileFromTable(key, addonUUID: string, schemaName: string): Promise<AddonFile | undefined> {
        // get file directly from table
        const addonSchema = await this.getAddonSchema(addonUUID, schemaName);
        if (addonSchema) {
            const file = await pepperi.api.adal.get({
                addon: addonUUID,
                table: schemaName,
                key: key,
            });
            return file.object;
        } else {
            return undefined;
        }
    }

    async getFiles(modificationDateTime: number = 0): Promise<any[]> {
        const schemes = await this.getSchemesToDownload();
        const pfsFiles = await Promise.all(schemes.map(async schema => {
            return (await pepperi.api.adal.getList({
                addon: schema.AddonUUID!,
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
    async getAddonSchema(addonUUID: string, schemaName: string): Promise<AddonDataScheme> {
        const schemas = await this.getSchemas();
        return schemas.find(schema => schema.Type === 'pfs' && schema.AddonUUID === addonUUID && schema.Name === schemaName);
    }
    async getSchemesToDownload(): Promise<AddonDataScheme[]> {
        // get schemas that its type is 'pfs'
        const schemas = await this.getSchemas();
        const schemesToDownload = schemas.filter(schema => schema.AddonUUID === config.AddonUUID);
        // TODO for now download only Assets schema
        // const res = schemesToDownload.filter(schema => schema.Name === 'Assets');     
        const res = schemesToDownload;     
        return res;
        
    }
    async getSchemas(): Promise<any[]> {
        const schemas = await pepperi.api.adal.getList({
            addon: '00000000-0000-0000-0000-00000000ada1',
            table: 'schemes',
        })
        return schemas.objects;
    }

}
export default FilesService;

    
