
import { PDFPageProxy } from "pdfjs-dist/types/src/display/api.js";

import * as PDFJS from 'pdfjs-dist';

export type PDFJSImage = {
    width: number;
    height: number;
    interpolate?: any;
    kind: number;
    data: Uint8Array;
};

export async function getImagesOnPage(page: PDFPageProxy): Promise<PDFJSImage[]> {
    const ops = await page.getOperatorList();
    const images: PDFJSImage[] = [];
    for (var j=0; j < ops.fnArray.length; j++) {
        if (ops.fnArray[j] == PDFJS.OPS.paintImageXObject) {
            const image = page.objs.get(ops.argsArray[j][0]) as PDFJSImage;
            images.push(image);
        }
    }
    return images;
}