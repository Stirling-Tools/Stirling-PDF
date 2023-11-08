
import { PDFPageProxy } from "pdfjs-dist/types/src/display/api.js";
import PDFJS from 'pdfjs-dist';

export async function getImagesOnPage(page: PDFPageProxy) {
    const ops = await page.getOperatorList();
    const images: any = [];
    for (var j=0; j < ops.fnArray.length; j++) {
        if (ops.fnArray[j] == PDFJS.OPS.paintImageXObject) {
            const image = page.objs.get(ops.argsArray[j][0]);
            images.push(image);
        }
    }
    return images;
}