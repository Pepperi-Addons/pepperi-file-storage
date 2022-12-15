import { AddonData } from "@pepperi-addons/papi-sdk";
import IApiService from "./iApiService";
import { Request } from '@pepperi-addons/debug-server';


export interface Survey extends AddonData{

    // Generated UUID
    Key?:string;

    // status keyword values (not free text)
    Status?:string;

    // unique ID - ?
    ExternalID?:string;

    // reference to the SurveyTemplate
    Template?:string;

    // contains object
    Answers?:Answer[];

    // the UUID of the user who created the survey
    // mandatory
    Creator?:string;

    // the UUID of the account the survey was created for
    // mandatory??
    Account?:string;

    // // the UUID of the user who last updated the survey
    // Performer: string;
}

export interface Survey extends AddonData{

    // Generated UUID
    Key?:string;

    // status keyword values (not free text)
    Status?:string;

    // unique ID - ?
    ExternalID?:string;

    // reference to the SurveyTemplate
    Template?:string;

    // contains object
    Answers?:Answer[];

    // the UUID of the user who created the survey
    // mandatory
    Creator?:string;

    // the UUID of the account the survey was created for
    // mandatory??
    Account?:string;

    // // the UUID of the user who last updated the survey
    // Performer: string;
}

export interface SurveyTemplate extends AddonData{
    Name?: string,

    Description?: string,

    Active?: string,

    Sections?: Array<SurveyTemplateSection>
}

export interface SurveyTemplateSection{
    Name: string,

    Title: string,

    Description: string,

    Questions: Array<SurveyTemplateQuestion>
}

export interface SurveyTemplateQuestion{
    Name: string,

    Title: string,

    Description: string,

    Type: string,

    Mandatory: boolean
}

export interface Answer {
    // the key of the question in the template
    Key:string;

    // the answer
    Value: any;
}

export interface ResourceServiceBuilder{
 resourceCreationMandatoryFields: string[];

 resourceUniqueFields: string[];
 
 request: Request,
 
 iApiService: IApiService<AddonData>,

 resourceName: string,
}