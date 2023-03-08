import { MutateS3HandleFileCopy } from "./mutateS3HandleFileCopy";


export class MutateS3HandleMultipartUpload extends MutateS3HandleFileCopy {
	protected readonly BATCH_SIZE = 5;

	protected override async specificHandle(): Promise<any> {
		// Copy the file's data from the temp location to the final location.
		const absolutePath = this.s3PfsDal.relativeAbsoluteKeyService.getAbsolutePath(this.newFileFields.Key);
		const tempFileURLs: Array<string> = this.s3PfsDal.request.body.TemporaryFileURLs;

		// Create multipart upload
		const { UploadId } = await this.s3PfsDal.awsDal.createMultipartUpload(absolutePath);

		// Copy upload parts in batches of size BATCH_SIZE
		const uploadedParts: AWS.S3.CompletedPart[] = [];
		for (let i = 0; i < tempFileURLs.length; i += this.BATCH_SIZE) {
			const end = Math.min(i + this.BATCH_SIZE, tempFileURLs.length);

			const copyUploadPromisesBatch = this.newFileFields.TemporaryFileURLs.slice(i, end).map((url, indexWithinBatch) => {
				const partNumber = i + indexWithinBatch + 1;
				return this.s3PfsDal.awsDal.copyUploadPart(absolutePath, UploadId!, partNumber, url);
			});

			const batchResults = await Promise.allSettled(copyUploadPromisesBatch);

			batchResults.forEach((result, index) => {
				if (result.status === 'rejected') {
					throw new Error(`Error copying upload part number ${i + index + 1}: ${result.reason}`);
				}
				else {
					const { ETag } = result.value.CopyPartResult;
					uploadedParts.push({ ETag, PartNumber: i + index + 1 });
				}
			});
		}

		// Complete multipart upload
		const res = await this.s3PfsDal.awsDal.completeMultipartUpload(absolutePath, UploadId!, uploadedParts);

		// Set the file version and size
		this.newFileFields.FileVersion = res.$response.data?.VersionId;
		this.newFileFields.FileSize = await this.s3PfsDal.awsDal.getFileSize(absolutePath);

		// Delete the TemporaryFileURLs
		delete this.newFileFields.TemporaryFileURLs;
	}
}
