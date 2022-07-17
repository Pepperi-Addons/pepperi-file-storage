import '@pepperi-addons/cpi-node'
import { DateUtils } from './date-utils';
import FilesService from './files-service'; 

export const router = Router();

export async function load(configuration: any) {
    pepperi.events.intercept('SyncTerminated' as any, {}, async (data, next, main) => {
        if(!await pepperi["configuration"].isWebApp()) {
            const lastSyncDataTime = DateUtils.getLastSyncDataTimeMills(data.JobInfoResponse?.ClientInfo?.LastSyncDateTime);
            const fileService = new FilesService();
            fileService.downloadFiles(lastSyncDataTime)
            .then(() => {
                console.log('PFS Files download completed');
            })
            .catch(error => {
                console.log(`Error downloading PFS files: ${error}`);
            })
        }
        await next(main);
    });
}

router.post('/get_file', async (req, res, next) => {
    let result = {};
    try {
        const addonUUID = req.body.AddonUUID;
        const fileKey = req.body.FileKey;
        const schemaName = req.body.SchemaName;
        if(!fileKey || !addonUUID || !schemaName) {
            throw new Error('Missing required parameters');
        }
        const fileService = new FilesService();
        const fileUrl = await fileService.getFileUrl(addonUUID, schemaName, fileKey);
        result = {
            URL: fileUrl,
        };
        res.json(result);
    } catch (err) {
        console.log(err);
        next(err)
    }
});
