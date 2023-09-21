import "@pepperi-addons/cpi-node";
import { ListFolderContentsCommand, ListObjectsCommand, DownloadFileCommand, MAXIMAL_LOCK_TIME, IFetchCommand, BaseResourceFetcherService, IntegrationTestBody } from "pfs-shared";
import { MobilePostCommand } from "./commands/mobilePostCommand";
import CpiAwsDal from "./dal/awsDal";
import { MobileCpiIndexedDataS3PfsDal } from "./dal/mobileCpiIndexedDataS3PfsDal";
import CpiPepperiDal from "./dal/pepperiDal";
import { PreSyncService } from "./preSync.service";
import { PreSyncResult } from "./entities";
import { WebAppCpiIndexedDataS3PfsDal } from "./dal/webAppCpiIndexedDataS3PfsDal";
import { WebAppPostCommand } from "./commands/webAppPostCommand";
import { FileUploadService } from "./fileUpload.service";
import { IntegrationTestsPostCommand } from "./commands/integrationTestsPostCommand";

export const router = Router();

export async function load(configuration: any)
{
	const preSyncService = new PreSyncService();
	await preSyncService.createRelations();

	FileUploadService.initiatePeriodicUploadInterval();
}

// will be called right before the sync started
router.post(PreSyncService.endpointName, async (req, res) =>
{
	const preSyncService = new PreSyncService();
	const areAllFilesUploadedResult: PreSyncResult = await preSyncService.areAllFilesUploaded();

	// If not all files are uploaded, start the upload process
	// This is so the user won't have to wait for the periodic upload interval to start
	// before he can Sync again.
	if(!areAllFilesUploadedResult.Success)
	{
		FileUploadService.asyncUploadAllFilesToUpload();
	}

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

router.post("/files", async (req, res, next) =>
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
		const uploadFileCommand = await getPostCommand(req, PfsDal, PepperiDal);
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
		let listCommand: IFetchCommand;

		if(req.query.folder)
		{
			listCommand = new ListFolderContentsCommand(req, PfsDal, PfsDal);
		}
		else
		{
			listCommand = new ListObjectsCommand(req, PfsDal, PfsDal);
		}

		const resourceFetcherService = new BaseResourceFetcherService(listCommand);
		result = await resourceFetcherService.fetch();

		res.json(result);
	}
	catch (err) 
	{
		console.log(err);
		next(err);
	}
});

async function getPostCommand(req, PfsDal: MobileCpiIndexedDataS3PfsDal, PepperiDal: CpiPepperiDal): Promise<WebAppPostCommand>
{
	let postCommand: WebAppPostCommand;
	const requestBody = req.body as IntegrationTestBody;
	if(requestBody?.IntegrationTestData)
	{
		postCommand = new IntegrationTestsPostCommand(req, PfsDal, PfsDal, PepperiDal);
	}
	else if(await global["app"]["wApp"]["isWebApp"]())
	{
		postCommand = new WebAppPostCommand(req, PfsDal, PfsDal, PepperiDal);
	}
	else
	{
		postCommand = new MobilePostCommand(req, PfsDal, PfsDal, PepperiDal);
	}
	
	return postCommand;
}

async function getDal(req) 
{
	const OAuthAccessToken = await pepperi.auth.getAccessToken();

	const awsDal = new CpiAwsDal();

	const pepperiDal = new CpiPepperiDal();

	let dal: MobileCpiIndexedDataS3PfsDal;

	const requestBody = req.body as IntegrationTestBody;

	if(requestBody?.IntegrationTestData?.IsWebApp ?? await global["app"]["wApp"]["isWebApp"]())
	{
		dal = new WebAppCpiIndexedDataS3PfsDal(OAuthAccessToken, req, MAXIMAL_LOCK_TIME, awsDal, pepperiDal);
	}
	else
	{
		dal = new MobileCpiIndexedDataS3PfsDal(OAuthAccessToken, req, MAXIMAL_LOCK_TIME, awsDal, pepperiDal);
	}

	return {PfsDal: dal, PepperiDal: pepperiDal} ;
}
