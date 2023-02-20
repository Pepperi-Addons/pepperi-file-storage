import { AMutateS3Handler } from "./aMutateS3Handler";

export class MutateS3HandleExpiredFile extends AMutateS3Handler
{
	public async execute(): Promise<any> {
		return await this.deleteFileData(this.existingFile.Key);
	}
}
