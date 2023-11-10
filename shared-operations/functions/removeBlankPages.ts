import { PDFDocument } from 'pdf-lib';
import { detectEmptyPages } from "./common/detectEmptyPages.js";

export async function removeBlankPages(snapshot: string | ArrayBuffer | Uint8Array, whiteThreashold: number) {
    
    const emptyPages = await detectEmptyPages(snapshot, whiteThreashold);

    console.log("Empty Pages: ", emptyPages);

    const pdfDoc = await PDFDocument.load(snapshot);

    // Reverse the array before looping in order to keep the indecies at the right pages. E.g. if you delete page 5 page 7 becomes page 6, if you delete page 7 page 5 remains page 5
    emptyPages.reverse().forEach(pageIndex => {
        pdfDoc.removePage(pageIndex);
    })

    return pdfDoc.save();
};