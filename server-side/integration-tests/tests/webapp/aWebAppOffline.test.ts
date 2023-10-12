import { AddonFile } from "@pepperi-addons/papi-sdk";
import fetch from "node-fetch";

import { IntegrationTestBody } from "pfs-shared";
import { APostOfflineTests, ITestsExecutor } from "../../aPostOffline.test";
import { testFileData } from "../../constants";


export abstract class AWebAppOfflineTest extends APostOfflineTests implements ITestsExecutor
{
    abstract subtitle: string;

    public override get title(): string
    {
    	return `WebApp Offline - ${this.subtitle}`;
    }

    //#region ITestsExecutor implementation
    public getExpectedOfflineUrlRegex(): RegExp
    {
    	return /\.pepperi\.com/i;
    }

    public async getPostFileData(): Promise<{TemporaryFileURLs: string[]}>
    {
    	const temporaryFile = await this.pfsOnlineService.createTempFile();
    	const fileBuffer: Buffer = this.getFileBufferFromDataUri();
		
    	await this.putBufferToURL(fileBuffer, temporaryFile.PutURL);

    	return {TemporaryFileURLs: [temporaryFile.TemporaryFileURL]};
    }

    protected getFileBufferFromDataUri() 
    {
    	let fileBuffer: Buffer;

    	const regex = /^data:.+\/(.+);base64,(.*)$/;
    	const matches = testFileData.match(regex);
    	if (matches?.length && matches?.length >= 3) 
    	{
    		const ext = matches[1];
    		const data = matches[2];
    		fileBuffer = Buffer.from(data, "base64");
    	}

    	else 
    	{
    		throw new Error("Invalid file data");
    	}
    	return fileBuffer;
    }

    protected async putBufferToURL(fileBuffer: Buffer, url: string) 
    {
    	const fetchResult = await fetch(url, {
    		method: "PUT",
    		body: fileBuffer,
    	});

    	if (!fetchResult.ok)
    	{
    		throw new Error(`Failed to upload file to ${url}`);
    	}
    }

    public async ensureLocalFileIsValid(offlineFile: AddonFile, expect: Chai.ExpectStatic): Promise<void>
    {
    	const url = offlineFile.URL!;
    	const buffer: Buffer = await this.filesFetcherService.downloadFile(url);
    	expect(buffer).to.not.be.undefined;
    	expect(buffer.length).to.be.equal(offlineFile.FileSize);
    }

    public getIntegrationTestBody(): IntegrationTestBody
    {
    	const integrationTestBody: IntegrationTestBody = {
    		IntegrationTestData: {
    			IsWebApp: true,
    			ShouldDeleteURLsCache: true,
    		}
    	};

    	return integrationTestBody;
    }

	//#endregion
}
