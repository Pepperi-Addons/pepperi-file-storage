import Jimp from "jimp";

export class ImageResizer 
{
	constructor(private readonly mimeType,
        private readonly imageBuffer: Buffer) 
	{

		const supportedMimeTypes = [Jimp.MIME_BMP,
			Jimp.MIME_JPEG,
			Jimp.MIME_PNG,
			Jimp.MIME_TIFF]

		if (!supportedMimeTypes.includes(mimeType)) 
		{
			throw new Error(`Bad Request. Creating a thumbnail for MIME type ${mimeType} is not supported.`)
		}
	}

	/**
     * Resizes the image given in the constructor to be eqaul to or less than the requested scales.
     * Images smaller than the requested scales will not be enlarged. The Image cover is fit, meaning aspect ration will be preserved, 
     * and image will be in requested scale by cropping it.
     * @param requestedScales  the requested scales
     * @returns a buffer of the new scaled image
     */
	public async resize(requestedScales: { "Size": '200x200' }) 
	{
		const requestedWidth = parseInt(requestedScales.Size.toLowerCase().split('x')[0]);
		const requestedHeight = parseInt(requestedScales.Size.toLowerCase().split('x')[1]);
		const buffer =  await (await Jimp.read(this.imageBuffer)).resize(requestedWidth, requestedHeight).getBufferAsync(this.mimeType);
		return buffer
	}

}