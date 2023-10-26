
import { PDFDocument } from 'pdf-lib';

import { createSubDocument } from "./extractPages.js";

export async function splitPDF(snapshot, splitAfterPageArray) {
    const pdfDoc = await PDFDocument.load(snapshot)

    const numberOfPages = pdfDoc.getPages().length;

    let pagesArray = [];
    let splitAfter = splitAfterPageArray.shift();
    const subDocuments = [];

    for (let i = 0; i < numberOfPages; i++) {
        if(i > splitAfter && pagesArray.length > 0) {
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