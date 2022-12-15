import '@pepperi-addons/cpi-node'
import { DateUtils } from './date-utils';
import FilesService from './files-service'; 

export const router = Router();

export async function load(configuration: any) {
    // pepperi.events.intercept('SyncTerminated' as any, {}, async (data, next, main) => {
    //     debugger;
    //     if(!await global['app']['wApp']['isWebApp']()) {
    //         const lastSyncDataTime = DateUtils.getLastSyncDataTimeMills(data.JobInfoResponse?.ClientInfo?.LastSyncDateTime);
    //         const fileService = new FilesService();
    //         fileService.downloadFiles(lastSyncDataTime)
    //         .then(() => {
    //             console.log('PFS Files download completed');
    //         })
    //         .catch(error => {
    //             console.log(`Error downloading PFS files: ${error}`);
    //         })
    //     }
    //     await next(main);
    // });
}

router.get('/file', async (req, res, next) => {
    let result = {};
    try {
        const addonUUID = req.query.addon_uuid?.toString();
        const fileKey = req.body.FileKey?.toString();
        const schemaName = req.body.SchemaName?.toString();

        if(!fileKey || !addonUUID || !schemaName) {
            throw new Error('Missing required parameters');
        }

        const fileService = new FilesService();
        result = await fileService.getFileWithLocalizedUrl(addonUUID, schemaName, fileKey);

        // localURL = await pepperi.files.rootDir() + Key
        // filePath = Key, fileBaseURL=baseUrl
        // If file is already downloaded to disk
        //      Does nothing, returns local path.
        // else
        //      Tries to download and return local path.

        // Need to validate that the file is actually on disk!
        // export const existsAsync = util.promisify(fs.exists);
        // export const mkdirAsync = util.promisify(fs.mkdir);
        global['app']['getLocaFilePath'](filePath, fileBaseURL)

        res.json(result);
    } catch (err) {
        console.log(err);
        next(err)
    }
});
