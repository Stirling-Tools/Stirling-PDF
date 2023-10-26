import { createSubDocument } from "./shared/createSubDocument.js";

export async function splitPDF(snapshot, splitAfterPageArray, PDFLib) {
    const pdfDoc = await PDFLib.PDFDocument.load(snapshot)

    const numberOfPages = pdfDoc.getPages().length;

    let pagesArray = [];
    let splitAfter = splitAfterPageArray.shift();
    const subDocuments = [];

    for (let i = 0; i < numberOfPages; i++) {
        if(i > splitAfter && pagesArray.length > 0) {
            subDocuments.push(await createSubDocument(pdfDoc, pagesArray, PDFLib));
            splitAfter = splitAfterPageArray.shift();
            pagesArray = [];
        }
        pagesArray.push(i);        
    }
    subDocuments.push(await createSubDocument(pdfDoc, pagesArray, PDFLib));
    pagesArray = [];

    return subDocuments;
};