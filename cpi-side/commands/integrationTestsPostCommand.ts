import { FileToUpload, ICommand, IntegrationTestBody, RelativeAbsoluteKeyService } from "pfs-shared";
import { MobilePostCommand } from "./mobilePostCommand";


export class IntegrationTestsPostCommand extends MobilePostCommand implements ICommand
{
	protected override createFileToUpload(relativeAbsoluteKeyService: RelativeAbsoluteKeyService, res: any): FileToUpload
	{
		const superFileToUpload: FileToUpload = super.createFileToUpload(relativeAbsoluteKeyService, res);

		superFileToUpload.ShouldFailUpload = (this.request.body as IntegrationTestBody)?.IntegrationTestData?.ShouldFailTemporaryFile;

		return superFileToUpload;
	}

	protected override async uploadToTempFile(res: any): Promise<void>
	{		
		if(!(this.request.body as IntegrationTestBody)?.IntegrationTestData?.IsWebApp && this.request.body.URI)
		{
			await super.uploadToTempFile(res);
		}
	}
}
