import { createHash } from "crypto";

export class BufferToMD5Builder
{
	public constructor()
	{ }

	public build(buffer: Buffer): string
	{
		const md5 = createHash("md5").update(buffer).digest("hex");
		return md5;
	}
}
