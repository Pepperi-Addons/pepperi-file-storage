import { IAws } from "pfs-shared";

export default class CpiAwsDal implements IAws
{
	// AWS connectivity isn't supported on CPI side.
    
	s3Upload(params: { Bucket?: string | undefined; Key: string; Body: any; ContentType: string; CacheControl?: string | undefined; }): Promise<any> 
	{
		throw new Error("Method not implemented.");
	}
	s3GetSignedUrl(params: { Bucket?: string | undefined; Key: string; Expires?: number | undefined; ContentType: string; }): Promise<string> 
	{
		throw new Error("Method not implemented.");
	}
	s3DeleteObjects(objectsPaths: string[]): Promise<any> 
	{
		throw new Error("Method not implemented.");
	}
	s3DeleteObject(objectsPath: string): Promise<any> 
	{
		throw new Error("Method not implemented.");
	}
	s3ListObjectVersions(objectPath: string): Promise<any> 
	{
		throw new Error("Method not implemented.");
	}
	cloudFrontInvalidate(objectsPath: string[]): Promise<any> 
	{
		throw new Error("Method not implemented.");
	}
	getFileSize(key: string): Promise<number> 
	{
		throw new Error("Method not implemented.");
	}
	copyS3Object(originURL: string, destinationKey: string, shouldCache: boolean | undefined): Promise<any> 
	{
		throw new Error("Method not implemented.");
	}
}
