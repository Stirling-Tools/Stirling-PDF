
import { PdfFile, RepresentationType } from "../../wrappers/PdfFile";
import { PDFDocument } from "pdf-lib";

export async function getPages(file: PdfFile, pageIndexes: number[]): Promise<PdfFile> {
    const pdfLibDocument = await file.pdfLibDocument;
    const subDocument = await PDFDocument.create();

    // Check that array max number is not larger pdf pages number
    if(Math.max(...pageIndexes) > pdfLibDocument.getPageCount()) {
        throw new Error(`The PDF document only has ${pdfLibDocument.getPageCount()} pages and you tried to extract page ${Math.max(...pageIndexes)}`);
    }

    const copiedPages = await subDocument.copyPages(pdfLibDocument, pageIndexes);

    for (let i = 0; i < copiedPages.length; i++) {
        subDocument.addPage(copiedPages[i]);
    }

    return new PdfFile(file.originalFilename, subDocument, RepresentationType.PDFLibDocument, file.filename);
}
