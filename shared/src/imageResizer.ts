import configure from "@jimp/custom";
import bmp from '@jimp/bmp';
import jpeg from '@jimp/jpeg';
import png from '@jimp/png';
import tiff from '@jimp/tiff';

import resize from "@jimp/plugin-resize";

export class ImageResizer 
{	
	protected supportedTypes: any[];
	protected jimp: any;
	constructor(private readonly mimeType: string,
        private readonly imageBuffer: Buffer) 
	{

		this.supportedTypes = [bmp, jpeg, png, tiff];
		const supportedMimeTypes: Array<string> = this.supportedTypes.map(type => Object.keys(type().mime)[0]);
		if (!supportedMimeTypes.includes(mimeType)) 
		{
			throw new Error(`Bad Request. Creating a thumbnail for MIME type ${mimeType} is not supported.`)
		}

		// Create a Jimp instance, that supports only resizing the supported types
		// For more information see: https://www.npmjs.com/package/@jimp/custom
		// This is done (instead of the generic package here https://www.npmjs.com/package/jimp) in order to keep imports size down.
		this.jimp = configure({
			types: this.supportedTypes,
			plugins: [resize],
		  });
	}

	/**
     * Resizes the image given in the constructor to be equal to or less than the requested scales.
     * Images smaller than the requested scales will not be enlarged. The Image cover is fit, meaning aspect ration will be preserved, 
     * and image will be in requested scale by cropping it.
     * @param requestedScales  the requested scales
     * @returns a buffer of the new scaled image
     */
	public async resize(requestedScales: { "Size": '200x200' }) 
	{
		const requestedWidth = parseInt(requestedScales.Size.toLowerCase().split('x')[0]);
		const requestedHeight = parseInt(requestedScales.Size.toLowerCase().split('x')[1]);
		const buffer =  await (await this.jimp.read(this.imageBuffer)).resize(requestedWidth, requestedHeight).getBufferAsync(this.mimeType);
		return buffer
	}

}