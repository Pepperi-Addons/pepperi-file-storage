import "@pepperi-addons/cpi-node";
import { ListFolderContentsCommand, ListObjectsCommand, DownloadFileCommand, MAXIMAL_LOCK_TIME } from "pfs-shared";
import { DataUriPostCommand } from "./commands/dataUriPostCommand";
import CpiAwsDal from "./dal/awsDal";
import { CpiIndexedDataS3PfsDal } from "./dal/cpiIndexedDataS3PfsDal";
import CpiPepperiDal from "./dal/pepperiDal";
import { PreSyncService } from "./preSync.service";
import { PreSyncResult } from "./entities";
import { TemporaryFileCpiIndexedDataS3PfsDal } from "./dal/temporaryFileCpiIndexedDataS3PfsDal";
import { TemporaryFileUrlPostCommand } from "./commands/temporaryFileUrlPostCommand";

export const router = Router();

export async function load(configuration: any)
{
	const preSyncService = new PreSyncService();
	await preSyncService.createRelations();
}

// will be called right before the sync started
router.post(PreSyncService.endpointName, async (req, res) =>
{
	const preSyncService = new PreSyncService();
	const areAllFilesUploadedResult: PreSyncResult = await preSyncService.areAllFilesUploaded();

	res.json(areAllFilesUploadedResult);
});

router.get("/file", async (req, res, next) => 
{
	try 
	{
		const addonUUID = req.query.addon_uuid?.toString();
		const fileKey = req.query.key?.toString();
		const schemaName = req.query.resource_name?.toString();

		if(!fileKey || !addonUUID || !schemaName) 
		{
			throw new Error("Missing required parameters");
		}

		req.query.Key = fileKey;

		const {PfsDal} = await getDal(req);
		const downloadFileCommand = new DownloadFileCommand(req, PfsDal, PfsDal);
		const result = await downloadFileCommand.execute();

		res.json(result);
	}
	catch (err) 
	{
		console.log(err);
		next(err);
	}
});

router.post("/file", async (req, res, next) =>
{
	try
	{
		const addonUUID = req.query.addon_uuid?.toString();
		const schemaName = req.query.resource_name?.toString();

		if(!addonUUID || !schemaName) 
		{
			throw new Error("Missing required parameters");
		}
		
		const {PfsDal, PepperiDal} = await getDal(req);
		const uploadFileCommand = getPostCommand(req, PfsDal, PepperiDal);
		const result = await uploadFileCommand.execute();

		res.json(result);
	}
	catch (err)
	{
		console.log(err);
		next(err);
	}
});

router.get("/files/find", async (req, res, next) => 
{
	try 
	{
		const addonUUID = req.query.addon_uuid?.toString();
		const schemaName = req.query.resource_name?.toString();

		if(!addonUUID || !schemaName) 
		{
			throw new Error("Missing required parameters");
		}

		const {PfsDal} = await getDal(req);

		let result: any;

		if(req.query.folder)
		{
			const listFolderContentsCommand = new ListFolderContentsCommand(req, PfsDal, PfsDal);
			result = await listFolderContentsCommand.execute();

		}
		else
		{
			const listObjectsCommand = new ListObjectsCommand(req, PfsDal, PfsDal);
			result = await listObjectsCommand.execute();
		}

		res.json(result);
	}
	catch (err) 
	{
		console.log(err);
		next(err);
	}
});

function getPostCommand(req, PfsDal: CpiIndexedDataS3PfsDal, PepperiDal: CpiPepperiDal): TemporaryFileUrlPostCommand
{
	let postCommand: TemporaryFileUrlPostCommand;

	if(Array.isArray(req.body?.TemporaryFileURLs))
	{
		postCommand = new TemporaryFileUrlPostCommand(req, PfsDal, PfsDal, PepperiDal);
	}
	else
	{
		postCommand = new DataUriPostCommand(req, PfsDal, PfsDal, PepperiDal);
	}
	
	return postCommand;
}

async function getDal(req) 
{
	const OAuthAccessToken = await pepperi.auth.getAccessToken();

	const awsDal = new CpiAwsDal();

	const pepperiDal = new CpiPepperiDal();

	let dal: CpiIndexedDataS3PfsDal;
	
	if(Array.isArray(req.body?.TemporaryFileURLs))
	{
		dal = new TemporaryFileCpiIndexedDataS3PfsDal(OAuthAccessToken, req, MAXIMAL_LOCK_TIME, awsDal, pepperiDal);
	}
	else
	{
		dal = new CpiIndexedDataS3PfsDal(OAuthAccessToken, req, MAXIMAL_LOCK_TIME, awsDal, pepperiDal);
	}

	return {PfsDal: dal, PepperiDal: pepperiDal} ;
}
