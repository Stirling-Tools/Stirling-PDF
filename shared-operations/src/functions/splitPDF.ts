
import { selectPages } from "./subDocumentFunctions";
import { PdfFile } from '../wrappers/PdfFile';

export type SplitPdfParamsType = {
    file: PdfFile;
    splitAfterPageArray: number[];
}

export async function splitPDF(params: SplitPdfParamsType): Promise<PdfFile[]> {
    const { file, splitAfterPageArray } = params;

    const pdflibDocument = await file.pdfLibDocument;

    const numberOfPages = pdflibDocument.getPages().length;

    let pagesArray: number[]  = [];
    let splitAfter = splitAfterPageArray.shift();
    const subDocuments: PdfFile[]  = [];

    for (let i = 0; i < numberOfPages; i++) {
        if(splitAfter && i > splitAfter && pagesArray.length > 0) {
            subDocuments.push(await selectPages({file, pagesToExtractArray:pagesArray}));
            splitAfter = splitAfterPageArray.shift();
            pagesArray = [];
        }
        pagesArray.push(i);
    }
    subDocuments.push(await selectPages({file, pagesToExtractArray:pagesArray}));
    pagesArray = [];

    return subDocuments;
};