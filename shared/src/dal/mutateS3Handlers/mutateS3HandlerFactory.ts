import { AbstractS3PfsDal } from "../abstractS3PfsDal";
import { AMutateS3Handler } from "./aMutateS3Handler";
import { MutateS3HandleExpiredFile } from "./mutateS3HandleExpiredFile";
import { MutateS3HandleFileUpload } from "./mutateS3HandleFileUpload";
import { MutateS3HandlePostBase } from "./mutateS3HandlePostBase";
import { MutateS3HandlePresignedUrl } from "./mutateS3HandlePresignedUrl";
import { MutateS3HandleTempFile } from "./mutateS3HandleTempFile";

export type MutateS3HandleType = "" | "tempFile" | "fileUpload" | "presignedUrl" | "expiredFile";
export class MutateS3HandlerFactory
{
    public static getHandler(
        type: MutateS3HandleType,
        newFileFields: any,
        existingFile: any,
        s3PfsDal: AbstractS3PfsDal,
        ): AMutateS3Handler
    {
        switch (type) {
            case "tempFile":
                return new MutateS3HandleTempFile(newFileFields, existingFile, s3PfsDal);
            case "fileUpload":
                return new MutateS3HandleFileUpload(newFileFields, existingFile, s3PfsDal);
            case "presignedUrl":
                return new MutateS3HandlePresignedUrl(newFileFields, existingFile, s3PfsDal);
            case "expiredFile":
                return new MutateS3HandleExpiredFile(newFileFields, existingFile, s3PfsDal);
            default:
                return new MutateS3HandlePostBase(newFileFields, existingFile, s3PfsDal);
        }
    }
}
