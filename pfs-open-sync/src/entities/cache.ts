import { CacheRemoveInput, CacheUpdateResult, CacheChangesInput } from '@pepperi-addons/papi-sdk'

export interface ICacheService
{    
    updateCache(modifiedObjects: CacheChangesInput): Promise<CacheUpdateResult[]>;
    removeEntries(removeCacheEntries: CacheRemoveInput): Promise<CacheUpdateResult[]>;
}
