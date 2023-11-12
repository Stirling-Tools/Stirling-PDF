
import { PDFDocument } from 'pdf-lib';

import { selectPages } from "./subDocumentFunctions";
import { PdfFile } from '../wrappers/PdfFile';

export async function splitPDF(file: PdfFile, splitAfterPageArray: number[]): Promise<PdfFile[]> {
    const byteFile = await file.convertToPdfLibFile();
    if (!byteFile?.pdfLib) return [];

    const numberOfPages = byteFile.pdfLib.getPages().length;

    let pagesArray: number[]  = [];
    let splitAfter = splitAfterPageArray.shift();
    const subDocuments: PdfFile[]  = [];

    for (let i = 0; i < numberOfPages; i++) {
        if(splitAfter && i > splitAfter && pagesArray.length > 0) {
            subDocuments.push(await selectPages(byteFile, pagesArray));
            splitAfter = splitAfterPageArray.shift();
            pagesArray = [];
        }
        pagesArray.push(i);
    }
    subDocuments.push(await selectPages(byteFile, pagesArray));
    pagesArray = [];

    return subDocuments;
};