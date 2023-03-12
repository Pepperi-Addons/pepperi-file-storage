import TempFileService from "../../tempFileService";
import { AbstractS3PfsDal } from "../abstractS3PfsDal";
import { MutateS3HandlePostBase } from "./mutateS3HandlePostBase";

export abstract class MutateS3HandleFileCopy extends MutateS3HandlePostBase
{
    constructor(
        newFileFields: any,
        existingFile: any,
        s3PfsDal: AbstractS3PfsDal,
        )
    {
        super(newFileFields, existingFile, s3PfsDal);
		this.validateInputsAreTempFiles();
    }

    validateInputsAreTempFiles()
    {
       const tempFileService = new TempFileService(this.s3PfsDal.OAuthAccessToken);

       const areAllUrlsTempFiles = this.newFileFields?.TemporaryFileURLs?.every((url: string) => tempFileService.isTempFile(url));
        if (!areAllUrlsTempFiles)
        {
            throw new Error("All TemporaryFileURLs must be temp files.");
        }
    }
}
