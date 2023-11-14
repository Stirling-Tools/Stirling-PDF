
import { PDFDocument } from 'pdf-lib';
import { PdfFile, convertAllToPdfLibFile, fromPdfLib } from '../wrappers/PdfFile';

export type MergeParamsType = {
    files: PdfFile[];
}

export async function mergePDFs(params: MergeParamsType): Promise<PdfFile> {

    const pdfLibFiles = await convertAllToPdfLibFile(params.files);

    const mergedPdf = await PDFDocument.create(); 

    for (let i = 0; i < pdfLibFiles.length; i++) {
        const pdfToMerge = await pdfLibFiles[i].getAsPdfLib();
        const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    return fromPdfLib(mergedPdf, params.files[0].filename);
};