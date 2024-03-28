import { 
    PutObjectCommandOutput,
    DeleteObjectsCommandOutput,
    DeleteObjectCommandOutput,
    ListObjectVersionsCommandOutput,
    CopyObjectCommandOutput,
    CreateMultipartUploadOutput,
    UploadPartCopyCommandOutput,
    CompleteMultipartUploadCommandOutput,
    CompletedPart,
    AbortMultipartUploadCommandOutput
} from "@aws-sdk/client-s3";

import { IAws } from "pfs-shared";


export default class CpiAwsDal implements IAws
{
	// AWS connectivity isn't supported on CPI side.
    
	s3Upload(params: { Bucket?: string | undefined; Key: string; Body: any; ContentType: string; CacheControl?: string | undefined; }): Promise<PutObjectCommandOutput> 
	{
		throw new Error("Method not implemented.");
	}
	s3GetSignedUrl(params: { Bucket?: string | undefined; Key: string; Expires?: number | undefined; ContentType: string; }): Promise<string> 
	{
		throw new Error("Method not implemented.");
	}
	s3DeleteObjects(objectsPaths: string[]): Promise<DeleteObjectsCommandOutput> 
	{
		throw new Error("Method not implemented.");
	}
	s3DeleteObject(objectsPath: string): Promise<DeleteObjectCommandOutput> 
	{
		throw new Error("Method not implemented.");
	}
	s3ListObjectVersions(objectPath: string): Promise<ListObjectVersionsCommandOutput> 
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
	copyS3Object(originURL: string, destinationKey: string, shouldCache: boolean | undefined): Promise<CopyObjectCommandOutput> 
	{
		throw new Error("Method not implemented.");
	}

	createMultipartUpload(key: string): Promise<CreateMultipartUploadOutput>
	{
		throw new Error("Method not implemented.");
	}

	copyUploadPart(key: string, uploadId: string, partNumber: number, copySource: string): Promise<UploadPartCopyCommandOutput>
	{
		throw new Error("Method not implemented.");
	}

	completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<CompleteMultipartUploadCommandOutput>
	{
		throw new Error("Method not implemented.");
	}

	abortMultipartUpload(key: string, uploadId: string): Promise<AbortMultipartUploadCommandOutput>
	{
		throw new Error("Method not implemented.");
	}
}

