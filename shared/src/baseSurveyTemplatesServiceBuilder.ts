import { Request } from '@pepperi-addons/debug-server';
import { ResourceServiceBuilder, Survey } from './types';
import IApiService from './iApiService';
import { SurveysConstants, SurveyTemplatesConstants } from './constants';

export class BaseSurveyTemplatesServiceBuilder implements ResourceServiceBuilder
{
	resourceCreationMandatoryFields: string[];
	resourceUniqueFields: string[];
	resourceName: string;

	constructor(public request: Request, public iApiService: IApiService<Survey>)
	{
		this.resourceCreationMandatoryFields = SurveyTemplatesConstants.MandatoryFields;
		this.resourceUniqueFields = SurveyTemplatesConstants.UNIQUE_FIELDS;
		this.resourceName = SurveysConstants.schemaNames.BASE_SURVEY_TEMPLATES;
	}
}

export default BaseSurveyTemplatesServiceBuilder;
