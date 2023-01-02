import { AbstractBasePfsDal } from './AbstartcBasePfsDal';
export abstract class AbstractS3PfsDal extends AbstractBasePfsDal
{
	//#region IPfsGetter
	async getObjectS3FileVersion(Key: any) {
		throw new Error('Not implemented in CPI side.');
	} 
	//#endregion
}
