import { Request } from "@pepperi-addons/debug-server";
import { AddonData, SearchBody, SearchData } from "@pepperi-addons/papi-sdk";
import jwtDecode from "jwt-decode";
import { IPfsGetter, IPfsMutator, RelativeAbsoluteKeyService, TransactionType } from "..";


export abstract class AbstractBasePfsDal implements IPfsGetter, IPfsMutator
{
	protected environment: string;
	protected DistributorUUID: string;
	protected clientAddonUUID: string;
	protected readonly MAXIMAL_LOCK_TIME; 
	protected clientSchemaName: string;
	protected _relativeAbsoluteKeyService: RelativeAbsoluteKeyService;

	public get OAuthAccessToken(): string
	{
		return this._OAuthAccessToken;
	}

	public get relativeAbsoluteKeyService(): RelativeAbsoluteKeyService
	{
		return this._relativeAbsoluteKeyService;
	}
    
	constructor(protected _OAuthAccessToken: string, public request: Request, maximalLockTime:number)
	{
		this.environment = jwtDecode(_OAuthAccessToken)["pepperi.datacenter"];
		this.DistributorUUID = jwtDecode(_OAuthAccessToken)["pepperi.distributoruuid"];
		this.clientAddonUUID = this.request.query.addon_uuid;
		this.clientSchemaName = this.request.query.resource_name;
		this.MAXIMAL_LOCK_TIME = maximalLockTime;
		this._relativeAbsoluteKeyService = new RelativeAbsoluteKeyService(this.DistributorUUID, this.clientAddonUUID, this.clientSchemaName);
	}

	getMaximalLockTime() 
	{
		return this.MAXIMAL_LOCK_TIME;
	}
	
	//#region IPfsMutator
	abstract lock(key: string, transactionType: TransactionType);

	abstract setRollbackData(item: any);

	abstract mutateS3(newFileFields: any, existingFile: any);

	abstract mutateADAL(newFileFields: any, existingFile: any);

	abstract notify(newFileFields: any, existingFile: any);
	
	abstract unlock(key: string);

	abstract invalidateCDN(file: any);

	abstract deleteS3FileVersion(Key: any, s3FileVersion: any);

	abstract batchDeleteS3(keys: string[]);

	abstract createTempFile(tempFileName: string);
	
	//#endregion

	//#region IPfsGetter

	abstract isObjectLocked(key: string);

	abstract getObjectS3FileVersion(Key: any);

	abstract getObjects(searchBody?: SearchBody): Promise<SearchData<AddonData>>;
	//#endregion
}
