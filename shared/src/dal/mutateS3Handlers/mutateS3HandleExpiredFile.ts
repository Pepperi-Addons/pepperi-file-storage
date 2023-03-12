import { AMutateS3Handler } from "./aMutateS3Handler";

export class MutateS3HandleExpiredFile extends AMutateS3Handler
{
	public override async execute(): Promise<void> {
		return await this.deleteFileData(this.existingFile.Key);
	}
}
