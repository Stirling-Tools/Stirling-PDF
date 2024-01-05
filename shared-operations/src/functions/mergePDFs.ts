
import { PDFDocument } from "pdf-lib";
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";

export interface MergeParamsType {
    files: PdfFile[];
}

export async function mergePDFs(params: MergeParamsType): Promise<PdfFile> {
    const mergedPdf = await PDFDocument.create(); 

    for (let i = 0; i < params.files.length; i++) {
        const pdfToMerge = await params.files[i].pdfLibDocument;
        const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const newName = "("+params.files.map(input => input.filename).join("_and_") + ")_merged";
    return new PdfFile("mergedPDF", mergedPdf, RepresentationType.PDFLibDocument, newName);
}