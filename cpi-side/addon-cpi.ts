import '@pepperi-addons/cpi-node'
import { DateUtils } from './date-utils';
import FilesService from './files-service'; 

export const router = Router();

export async function load(configuration: any) {
    pepperi.events.intercept('SyncStarted', {}, async (data, next, main) => {
        // tryhing to upload files.
    })

    pepperi.events.intercept('MyEvent' as any, {}, async (data, next, main) => {
        const file = "ajkjhgfdsatyhjkhgfe456" //base64
        const res = await pepperi.files.post({
            file: file,
            key: '123455', // file name
            MIME: 'images/png'
        });
    })
    pepperi.events.intercept('SyncTerminated' as any, {}, async (data, next, main) => {
        debugger
        if(!await global['app']['wApp']['isWebApp']()) {
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
router.post('/post_file', async (req, res, next) => {
    // save file to somewhere..

})
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
