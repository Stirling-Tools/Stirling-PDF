
import { PDFDocument } from 'pdf-lib';
import { createSubDocument } from './createSubDocument';

export async function extractPages(snapshot, pagesToExtractArray) {
    const pdfDoc = await PDFDocument.load(snapshot)

    // TODO: invent a better format for pagesToExtractArray and convert it.
    return createSubDocument(pdfDoc, pagesToExtractArray);
};
