import '@pepperi-addons/cpi-node'
import FilesService from './files-service'; 

export const router = Router();

export async function load(configuration: any) {
    pepperi.events.intercept('SyncTerminated' as any, {}, async (data, next, main) => {
        debugger
        const lastSyncDataTime = getLastSyncDataTimeMills(data.JobInfoResponse?.ClientInfo?.LastSyncDateTime);
        const isResync = lastSyncDataTime == 0;
        const fileService = new FilesService();
        fileService.downloadFiles(lastSyncDataTime)
        .then(() => {
            console.log('PFS Files download completed');
        })
        .catch(error => {
            console.log(`Error downloading PFS files: ${error}`);
        })
        await next(main);
    });
}

router.post('/get_file', async (req, res, next) => {
    let result = {};

    try {
        const addonUUID = req.body.AddonUUID;
        const fileKey = req.body.FileKey;
        if(!fileKey) {
            throw new Error('FileKey are required');
        }
        const fileService = new FilesService();
        const fileUrl = await fileService.getFileUrl(addonUUID, fileKey);
        result = {
            URL: fileUrl,
        };
        res.json(result);
    } catch (err) {
        console.log(err);
        next(err)
    }

});

function getLastSyncDataTimeMills(milliTicks: number) {
    const nanoTicks = milliTicks * 10000;
    return fromTicksToMills(nanoTicks);
}
function fromTicksToMills(ticks: number) {
    return Number.isInteger(ticks) ? new Date(ticks / 1e+4 + new Date('0001-01-01T00:00:00Z').getTime()).getTime() : 0;
}
function fromTicksToDate(ticks: number) {
    return Number.isInteger(ticks) ? new Date(ticks / 1e+4 + new Date('0001-01-01T00:00:00Z').getTime()).toDateString() : null;
}