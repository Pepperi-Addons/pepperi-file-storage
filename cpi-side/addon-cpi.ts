import "@pepperi-addons/cpi-node";
import { ListFolderContentsCommand, ListObjectsCommand, DownloadFileCommand, MAXIMAL_LOCK_TIME } from "pfs-shared";
import { CpiPostCommand } from "./commands/cpiPostCommand";
import CpiAwsDal from "./dal/awsDal";
import { CpiIndexedDataS3PfsDal } from "./dal/cpiIndexedDataS3PfsDal";
import CpiPepperiDal from "./dal/pepperiDal";
import { BeforeSyncService } from "./beforeSync.service";
import { BeforeSyncResult } from "./entities";

export const router = Router();

export async function load(configuration: any)
{
	const beforeSyncService = new BeforeSyncService();
	await beforeSyncService.createRelations();
}

// will be called right before the sync started
router.post(BeforeSyncService.endpointName, async (req, res) =>
{
	const beforeSyncService = new BeforeSyncService();
	const areAllFilesUploadedResult: BeforeSyncResult = await beforeSyncService.areAllFilesUploaded();

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
		const uploadFileCommand = new CpiPostCommand(req, PfsDal, PfsDal, PepperiDal);
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

async function getDal(req) 
{
	const OAuthAccessToken = await pepperi.auth.getAccessToken();

	const awsDal = new CpiAwsDal();

	const pepperiDal = new CpiPepperiDal();

	const dal = new CpiIndexedDataS3PfsDal(OAuthAccessToken, req, MAXIMAL_LOCK_TIME, awsDal, pepperiDal);

	return {PfsDal: dal, PepperiDal: pepperiDal} ;
}
