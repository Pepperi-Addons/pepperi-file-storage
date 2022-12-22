import '@pepperi-addons/cpi-node'
import { MAXIMAL_LOCK_TIME } from 'pfs-shared';
import { IndexedDataS3PfsDal } from './dal/IndexedDataS3PfsDal';
import { DownloadFileCommand } from './pfsCommands/downloadFileCommand';
import { ListFolderContentsCommand } from './pfsCommands/listFolderContentsCommand';
import { ListObjectsCommand } from './pfsCommands/listObjectsCommand';

export const router = Router();

export async function load(configuration: any) 
{ }

router.get('/file', async (req, res, next) => 
{
	try 
	{
		const addonUUID = req.query.addon_uuid?.toString();
		const fileKey = req.query.key?.toString();
		const schemaName = req.query.resource_name?.toString();

		if(!fileKey || !addonUUID || !schemaName) 
		{
			throw new Error('Missing required parameters');
		}
		const OAuthAccessToken = await pepperi.auth.getAccessToken();

		const dal = new IndexedDataS3PfsDal(req, MAXIMAL_LOCK_TIME, OAuthAccessToken);
		const downloadFileCommand = new DownloadFileCommand(req, OAuthAccessToken, dal, dal);
		const result = await downloadFileCommand.execute();

		res.json(result);
	}
	catch (err) 
	{
		console.log(err);
		next(err)
	}
});

router.get('/files/find', async (req, res, next) => 
{
	try 
	{
		const addonUUID = req.query.addon_uuid?.toString();
		const schemaName = req.query.resource_name?.toString();

		if(!addonUUID || !schemaName) 
		{
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
	}
	catch (err) 
	{
		console.log(err);
		next(err)
	}
});
