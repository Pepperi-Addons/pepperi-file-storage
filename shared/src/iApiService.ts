import { AddonData, FindOptions } from '@pepperi-addons/papi-sdk';
import { Survey } from './types';

export interface IApiService<T extends AddonData>
{
	getResources(findOptions: FindOptions): Promise<Array<T>>;

	getResourceByKey(key: string): Promise<T>;

    /**
     * Returns an *array* of surveys. It is up to the user to validate the response length.
     * @param unique_field The unique field to use for the search
     * @param value The value to search for
     * @returns An *array* of surveys that match the search
     */
    getResourceByUniqueField(unique_field: string, value: any): Promise<Array<T>>;

    postResource(body: Survey): Promise<T>;

    searchResources(body: any): Promise<Array<T>>;
}

export default IApiService;