import '@pepperi-addons/cpi-node'
import { ListFolderContentsCommand, ListObjectsCommand, DownloadFileCommand, MAXIMAL_LOCK_TIME } from 'pfs-shared';
import CpiAwsDal from './dal/awsDal';
import { CpiIndexedDataS3PfsDal } from './dal/cpiIndexedDataS3PfsDal';
import CpiPepperiDal from './dal/pepperiDal';

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

		const dal = await getDal(req);
		const downloadFileCommand = new DownloadFileCommand(req, dal, dal);
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

		const dal = await getDal(req);

		let result: any;

		if(req.query.folder)
		{
			const listFolderContentsCommand = new ListFolderContentsCommand(req, dal, dal);
			result = await listFolderContentsCommand.execute();

		}
		else
		{
			const listObjectsCommand = new ListObjectsCommand(req, dal, dal);
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
async function getDal(req) 
{
	const OAuthAccessToken = await pepperi.auth.getAccessToken();

	const awsDal = new CpiAwsDal();

	const pepperiDal = new CpiPepperiDal();

	const dal = new CpiIndexedDataS3PfsDal(OAuthAccessToken, req, MAXIMAL_LOCK_TIME, awsDal, pepperiDal);

	return dal ;
}

