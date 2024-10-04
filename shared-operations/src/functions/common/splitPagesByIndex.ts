import { PdfFile } from "../../wrappers/PdfFile";
import { getPages } from "./getPagesByIndex";

export async function splitPagesByIndex(file: PdfFile, splitAfterPageIndexes: number[]): Promise<PdfFile[]> {
    const pdfLibDocument = await file.pdfLibDocument;
    const numberOfPages = pdfLibDocument.getPages().length;

    let pagesArray: number[]  = [];
    let splitAfter = splitAfterPageIndexes.shift();
    const subDocuments: PdfFile[]  = [];

    for (let i = 0; i < numberOfPages; i++) {
        if(splitAfter && i > splitAfter && pagesArray.length > 0) {
            subDocuments.push(await getPages(file, pagesArray));
            splitAfter = splitAfterPageIndexes.shift();
            pagesArray = [];
        }
        pagesArray.push(i);
    }
    subDocuments.push(await getPages(file, pagesArray));
    pagesArray = [];

    return subDocuments;
}