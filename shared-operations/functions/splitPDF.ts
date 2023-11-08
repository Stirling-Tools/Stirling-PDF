
import { PDFDocument } from 'pdf-lib';

import { createSubDocument } from "./createSubDocument.js";

export async function splitPDF(snapshot: string | Uint8Array | ArrayBuffer, splitAfterPageArray: number[]): Promise<Uint8Array[]> {

    const pdfDoc = await PDFDocument.load(snapshot)

    const numberOfPages = pdfDoc.getPages().length;

    let pagesArray = [];
    let splitAfter = splitAfterPageArray.shift();
    const subDocuments = [];

    for (let i = 0; i < numberOfPages; i++) {
        if(splitAfter && i > splitAfter && pagesArray.length > 0) {
            subDocuments.push(await createSubDocument(pdfDoc, pagesArray));
            splitAfter = splitAfterPageArray.shift();
            pagesArray = [];
        }
        pagesArray.push(i);
    }
    subDocuments.push(await createSubDocument(pdfDoc, pagesArray));
    pagesArray = [];

    return subDocuments;
};