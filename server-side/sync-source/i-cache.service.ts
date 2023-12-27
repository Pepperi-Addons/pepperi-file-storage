import { ModifiedObjects } from "./update-cache/modified-objects";

export interface ICacheService
{    
    updateCache(modifiedObjects: ModifiedObjects): Promise<any>;
}