import { Relation } from "@pepperi-addons/papi-sdk";

import { AddonUUID } from "../addon.config.json";
import { FilesToUploadDal } from "./dal/filesToUploadDal";
import CpiPepperiDal from "./dal/pepperiDal";
import { BeforeSyncResult } from "./entities";


export class PreSyncService
{
	
	public static readonly endpointName = "/are_all_files_uploaded";

	/**
     * Creates the CPIAddonAPI relations for BeforeSync and BeforeResync
     */
	public async createRelations(): Promise<void>
	{
		// This is currently done in CPI-side since the relations aren't synced to the client
		await this.createRelation("BeforeSync");
		await this.createRelation("BeforeResync");
	}

	/**
     * Creates a CPIAddonAPI typed relation, with Relation Name BeforeSync or BeforeResync
     * @param relationName {string} The name of the relation to create
     * @returns {Promise<void>}
     */
	protected async createRelation(relationName: "BeforeSync" | "BeforeResync"): Promise<void>
	{
		const relation: Relation = {
			Type: "CPIAddonAPI" as any,
			AddonRelativeURL: `/addon-cpi${PreSyncService.endpointName}`,
			AddonUUID: AddonUUID,
			RelationName: relationName,
			Name: `PFS_${relationName}`,
			Description: "",
			Timeout: 30000,
		};
    
		await pepperi.addons.data.relations.upsert(relation);
	}

	/**
     * Checks if all files are uploaded to S3 and ready for sync
     * @returns {Promise<BeforeSyncResult>}
     */
	public async areAllFilesUploaded(): Promise<BeforeSyncResult>
	{
		const filesToUploadDal = new FilesToUploadDal(new CpiPepperiDal());
		const filesToUpload = (await filesToUploadDal.search({})).Objects.filter(file => !file.Hidden);
		const areAllFilesUploaded = filesToUpload.length === 0;

		const res: BeforeSyncResult = {
			Success: areAllFilesUploaded,
			Message: areAllFilesUploaded ? "" : "PFS failed the sync request. Not all files are uploaded to S3 yet."
		};

		return res;
	}
}
