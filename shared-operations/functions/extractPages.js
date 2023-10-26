
import { PDFDocument } from 'pdf-lib';

export async function extractPages(snapshot, pagesToExtractArray) {
    const pdfDoc = await PDFDocument.load(snapshot)

    // TODO: invent a better format for pagesToExtractArray and convert it.
    return createSubDocument(pdfDoc, pagesToExtractArray);
};

export async function createSubDocument(pdfDoc, pagesToExtractArray) {
    const subDocument = await PDFDocument.create();

    // Check that array max number is not larger pdf pages number
    if(Math.max(...pagesToExtractArray) >= pdfDoc.getPageCount()) {
        throw new Error(`The PDF document only has ${pdfDoc.getPageCount()} pages and you tried to extract page ${Math.max(...pagesToExtractArray)}`);
    }

    const copiedPages = await subDocument.copyPages(pdfDoc, pagesToExtractArray);

    for (let i = 0; i < copiedPages.length; i++) {
        subDocument.addPage(copiedPages[i]);
    }

    return subDocument.save();
}