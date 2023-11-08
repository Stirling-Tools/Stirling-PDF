
import { PDFDocument } from 'pdf-lib';
import { createSubDocument } from './common/createSubDocument';

export async function extractPages(snapshot: string | Uint8Array | ArrayBuffer, pagesToExtractArray: number[]): Promise<Uint8Array>{
    const pdfDoc = await PDFDocument.load(snapshot)

    // TODO: invent a better format for pagesToExtractArray and convert it.
    return createSubDocument(pdfDoc, pagesToExtractArray);
};
