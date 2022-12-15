export const SurveysConstants = 
{
	schemaNames: {
		BASE_ACTIVITIES: "baseActivities",
		BASE_SURVEYS: "baseSurveys",
		BASE_SURVEY_TEMPLATES: "baseSurveyTemplates",
		SURVEY_ANSWERS: "surveyAnswers",
		SURVEY_TEMPLATE_SECTIONS: "surveyTemplateSections",
		SURVEY_TEMPLATE_QUESTIONS: "surveyTemplateQuestions"

	},
	dependentAddonsUUIDs: {
		BASE_ACTIVITIES: "92b9bd68-1660-4998-91bc-3b745b4bab11"
	},
	UNIQUE_FIELDS: ["Key"],
	DATA_SOURCE_INDEX_NAME: "baseActivities",
	MandatoryFields : ["Creator", "Template", "Account"]
}

export const SurveyTemplatesConstants = 
{
	UNIQUE_FIELDS: ["Key"],
	MandatoryFields : []

}
