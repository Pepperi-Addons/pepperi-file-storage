import { AddonFile } from "@pepperi-addons/papi-sdk";
import jwtDecode from "jwt-decode";

import { ABaseOfflinePfsTests } from "./aBaseOfflinePfsTests.test";
import { IntegrationTestBody } from "pfs-shared";


export interface ITestsExecutor
{
	getPostFileData(): Promise<{URI: string} | {TemporaryFileURLs: string[]}>;
	getExpectedOfflineUrlRegex(): RegExp;
	ensureLocalFileIsValid(offlineFile: AddonFile, expect: Chai.ExpectStatic): Promise<void>;
	getIntegrationTestBody(): IntegrationTestBody
	title: string;
}

export abstract class APostOfflineTests extends ABaseOfflinePfsTests
{
	constructor(protected testsExecutor: ITestsExecutor)
	{
		super();
	}

	get title(): string
	{
		return this.testsExecutor.title;
	}

	/**
	 * Gets the file using the fileKey online, and ensure the online URL is valid
	 * and that the data was successfully uploaded to S3, comparing the actual file
	 * data size to the value in the FileSize property of the online file.
	 * @param {Chai.ExpectStatic} expect
	 * @param {string} fileKey - The Key to get online and validate. 
	 */
	public async validateOnlineFile(expect: Chai.ExpectStatic, fileKey: string): Promise<void>
	{
		const onlineFile = await this.pfsOnlineService.getByKey(this.pfsSchemaName, fileKey);
		expect(onlineFile).to.not.be.undefined;
		expect(onlineFile.Key).to.equal(fileKey);

		// Validate URL
		expect(onlineFile).to.have.property("URL").that.is.a("string").and.is.not.empty;
		expect(onlineFile.URL).to.include("pfs.");
		const distributorUUID = jwtDecode(this.container.client.OAuthAccessToken)["pepperi.distributoruuid"];
		expect(onlineFile.URL).to.include(`${distributorUUID}/${this.container.client.AddonUUID}/${this.pfsSchemaName}/${fileKey}`);

		// Ensure the file exists in the provided URL
		const url = onlineFile.URL!;
		const buffer: Buffer = await this.filesFetcherService.downloadFile(url);
		expect(buffer).to.not.be.undefined;
		expect(buffer.length).to.be.equal(onlineFile.FileSize);
	}
}
