import '@pepperi-addons/cpi-node'
import { MAXIMAL_LOCK_TIME } from 'pfs-shared';
import { IndexedDataS3PfsDal } from './dal/IndexedDataS3PfsDal';
import { DownloadFileCommand } from './pfsCommands/downloadFileCommand';
import { ListFolderContentsCommand } from './pfsCommands/listFolderContentsCommand';
import { ListObjectsCommand } from './pfsCommands/listObjectsCommand';

export const router = Router();

export async function load(configuration: any) { }

router.get('/file', async (req, res, next) => {
    try {
        const addonUUID = req.query.addon_uuid?.toString();
        const fileKey = req.query.key?.toString();
        const schemaName = req.query.resource_name?.toString();

        if(!fileKey || !addonUUID || !schemaName) {
            throw new Error('Missing required parameters');
        }
        const OAuthAccessToken = await pepperi.auth.getAccessToken();

        const dal = new IndexedDataS3PfsDal(req, MAXIMAL_LOCK_TIME, OAuthAccessToken);
        const downloadFileCommand = new DownloadFileCommand(req, OAuthAccessToken, dal, dal);
        const result = await downloadFileCommand.execute();

        // localURL = await pepperi.files.rootDir() + Key
        // filePath = Key, fileBaseURL=baseUrl
        // If file is already downloaded to disk
        //      Does nothing, returns local path.
        // else
        //      Tries to download and return local path.

        // Need to validate that the file is actually on disk!
        // export const existsAsync = util.promisify(fs.exists);
        // export const mkdirAsync = util.promisify(fs.mkdir);
        // global['app']['getLocaFilePath'](filePath, fileBaseURL)

        res.json(result);
    } catch (err) {
        console.log(err);
        next(err)
    }
});

router.get('/files/find', async (req, res, next) => {
    try {
        const addonUUID = req.query.addon_uuid?.toString();
        const schemaName = req.query.resource_name?.toString();

        if(!addonUUID || !schemaName) {
            throw new Error('Missing required parameters');
        }

        const OAuthAccessToken = await pepperi.auth.getAccessToken();
        const dal = new IndexedDataS3PfsDal(req, MAXIMAL_LOCK_TIME, OAuthAccessToken);

        let result: any;

        if(req.query.folder)
        {
            const listFolderContentsCommand = new ListFolderContentsCommand(req, OAuthAccessToken, dal, dal);
            result = await listFolderContentsCommand.execute();

        }
        else
        {
            const listObjectsCommand = new ListObjectsCommand(req, OAuthAccessToken, dal, dal);
            result = await listObjectsCommand.execute();
        }

        res.json(result);
    } catch (err) {
        console.log(err);
        next(err)
    }
});
