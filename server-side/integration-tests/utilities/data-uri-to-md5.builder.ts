import { BufferToMD5Builder } from "./buffer-to-md5.builder";

export class DataUriToMD5Builder
{
	public constructor()
	{ }

	public build(dataUri: string): string
	{
		const fileBuffer = this.getBufferFromDataUri(dataUri);
		const md5 = this.getMD5FromBuffer(fileBuffer);

		return md5;
	}

	protected getBufferFromDataUri(dataUri: string): Buffer
	{
		let fileBuffer: Buffer;

		const regex = /^data:.+\/(.+);base64,(.*)$/;
		const matches = dataUri.match(regex);
		if (matches?.length && matches?.length >= 3)
		{
			const data = matches[2];
			fileBuffer = Buffer.from(data, "base64");
		}
		else
		{
			throw new Error("Invalid file data");
		}

		return fileBuffer;
	}

	protected getMD5FromBuffer(fileBuffer: Buffer): string
	{
		const bufferToMd5Builder = new BufferToMD5Builder();
		const md5 = bufferToMd5Builder.build(fileBuffer);
        
		return md5;
	}
}
