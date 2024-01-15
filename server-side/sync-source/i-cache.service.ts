import { IModifiedObjects } from "./update-cache/i-modified-objects";

export interface ICacheService
{    
    updateCache(modifiedObjects: IModifiedObjects): Promise<any>;
}
