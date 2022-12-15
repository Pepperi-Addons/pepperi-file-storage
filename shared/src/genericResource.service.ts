import { AddonData, FindOptions } from '@pepperi-addons/papi-sdk'
import { Request } from '@pepperi-addons/debug-server';
import { ResourceServiceBuilder } from './types';
import IApiService from './iApiService';
import { v4 as uuid } from 'uuid';

export class GenericResourceService 
{
	protected request: Request;
	protected iApiService: IApiService<AddonData>;
	protected resourceUniqueFields: Array<string>
	protected resourceName: string;
	protected resourceCreationMandatoryFields: Array<string>;

	constructor(resourceServiceBuilder: ResourceServiceBuilder)
	{
		this.request = resourceServiceBuilder.request;
		this.iApiService = resourceServiceBuilder.iApiService;
		this.resourceName = resourceServiceBuilder.resourceName;
		this.resourceUniqueFields = resourceServiceBuilder.resourceUniqueFields;
		this.resourceCreationMandatoryFields = resourceServiceBuilder.resourceCreationMandatoryFields;
	}

	/**
     * Get resources
     * @returns An array of resources
     */
	getResources(): Promise<Array<AddonData>>
	{
		const findOptions: FindOptions = this.buildFindOptionsFromRequestQuery();

		return this.iApiService.getResources(findOptions);
	}

	/**
     * Build a FindOptions object from the request query
     * @returns FindOptions object from request query
     */
	private buildFindOptionsFromRequestQuery(): FindOptions
	{
		return {
			...(this.request.query.fields && {fields: this.request.query.fields.split(',')}),
			...(this.request.query.where && {where: this.request.query.where}),
			...(this.request.query.order_by && {order_by: this.request.query.order_by}),
			...(this.request.query.page && {page: this.request.query.page}),
			...(this.request.query.page_size && {page_size: this.request.query.page_size}),
			...(this.request.query.include_deleted && {include_deleted: this.request.query.include_deleted}),
		};
	}

	/**
     * 
     * @returns A resource by key
     */
	async getResourceByKey(key?: string)
	{
		const requestedKey = key ?? this.request.query.key;
		this.validateGetResourceByKeyRequest(requestedKey);

		let resource: AddonData = {};
		try
		{
			resource = await this.iApiService.getResourceByKey(requestedKey);
		}
		catch(papiError)
		{
			if(papiError instanceof Error)
			{
				console.log(papiError);
				const error :any = new Error(`Could not find a ${this.resourceName} with requested key '${requestedKey}'`);
				error.code = 404;

				throw error;
			}
		}
		return resource;
	}

	/**
     * Validate the request query for getResourceByKey
     */
	validateGetResourceByKeyRequest(key: string)
	{
		if(!key)
		{
			const errorMessage = `The request query must contain a key parameter.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
	}

	/**
     * 
     * @returns A resource by unique field
     */
	async getResourceByUniqueField(): Promise<AddonData>
	{
		this.validateGetResourceByUniqueFieldRequest();

		if(this.request.query.unique_field === 'Key')
		{
			return this.getResourceByKey(this.request.query.value);
		}
		else
		{
			const res: Array<AddonData> = await this.iApiService.getResourceByUniqueField(this.request.query.unique_field, this.request.query.value);
            
			this.validateGetByUniqueFieldResult(res);

			return res[0];
		}
	}

	/**
     * Throws an exception in case the number of results is not 1.
     * @param res the list of results to validate
     */
	private validateGetByUniqueFieldResult(res: AddonData[])
	{
		if (res.length === 0) 
		{
			const errorMessage = `Could not find a ${this.resourceName} with unique_field: '${this.request.query.unique_field}' and value '${this.request.query.value}'`;
			console.error(errorMessage);
			const error: any = new Error(errorMessage);
			error.code = 404;
			throw error;
		}

		if (res.length > 1) 
		{
			// Something super strange happened...
			const errorMessage = `Found more than one ${this.resourceName} with unique_field: '${this.request.query.unique_field}' and value '${this.request.query.value}'`;
			console.error(errorMessage);
			const error: any = new Error(errorMessage);
			error.code = 404;
			throw error;
		}
	}

	/**
     * Validate the request query for getSurveyByUniqueField 
     */
	validateGetResourceByUniqueFieldRequest()
	{
		if(!this.request.query.unique_field)
		{
			const errorMessage = `The request query must contain a unique_field parameter.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}

		if(!this.request.query.value)
		{
			const errorMessage = `The request query must contain a value parameter.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}

		if(!this.resourceUniqueFields.includes(this.request.query.unique_field))
		{
			const errorMessage = `The unique_field parameter must be one of the following: '${this.resourceUniqueFields.join(', ')}'.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
	}
             
	async postResource() : Promise<AddonData>
	{
		this.createKeyIfMissing()
		await this.validatePostMandatoryFields();
		return await this.iApiService.postResource(this.request.body);
	}

	private createKeyIfMissing()
    {
        this.request.body.Key = this.request.body.Key ? this.request.body.Key : uuid();
    }

	/**
     * throws an error if mandatory fields are missing from the request body
     */
	async validatePostMandatoryFields()
	{
		const isRequestMissingCreationMandatoryField = this.resourceCreationMandatoryFields.some(mandatoryField => !Object.keys(this.request.body).includes(mandatoryField));
		if(isRequestMissingCreationMandatoryField)
		{
			// Ensure a resource exists, else throw an error.
			try
			{
				await this.getResourceByKey(this.request.body.Key);
			}
			catch(error)
			{
				// Resource not found and request is missing mandatory creation fields. Throw an error.
				const errorMessage = `The ${this.resourceName} with key '${this.request.body.Key}' does not exist. The following fields are mandatory on creation: ${JSON.stringify(this.resourceCreationMandatoryFields)}`;
				console.error(errorMessage);
				throw new Error(errorMessage);
			}
		}
	}

    
	/**
     * Similar to getResources 
     * @returns An array of resources that match the parameters of the request body
     */
	async search(): Promise<AddonData[]>
	{
		this.validateSearchRequest();
		return await this.iApiService.searchResources(this.request.body);
	}
 
	validateSearchRequest() 
	{
		if(this.request.body.UniqueFieldID && !this.resourceUniqueFields.includes(this.request.body.UniqueFieldID))
		{
			const errorMessage = `The passed UniqueFieldID is not supported: '${this.request.body.UniqueFieldID}'. Supported UniqueFieldID values are: ${JSON.stringify(this.resourceUniqueFields)}`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
 
		if(this.request.body.KeyList && (this.request.body.UniqueFieldID || this.request.body.UniqueFieldList))
		{
			const errorMessage = `Sending both KeyList and UniqueFieldList is not supported.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
 
		if(this.request.body.UniqueFieldList && !this.request.body.UniqueFieldID)
		{
			const errorMessage = `Missing UniqueFieldID parameter.`;
			console.error(errorMessage);
			throw new Error(errorMessage);
		}
	}
}

export default GenericResourceService;
