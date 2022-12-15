import { Request } from '@pepperi-addons/debug-server';
import { ResourceServiceBuilder, Survey } from './types';
import IApiService from './iApiService';
import { SurveysConstants } from './constants';

export class BaseSurveysServiceBuilder implements ResourceServiceBuilder
{
	resourceCreationMandatoryFields: string[];
	resourceUniqueFields: string[];
	resourceName: string;

	constructor(public request: Request, public iApiService: IApiService<Survey>)
	{
		this.resourceCreationMandatoryFields = SurveysConstants.MandatoryFields;
		this.resourceUniqueFields = SurveysConstants.UNIQUE_FIELDS;
		this.resourceName = SurveysConstants.schemaNames.BASE_SURVEYS;
	}
}

export default BaseSurveysServiceBuilder;
