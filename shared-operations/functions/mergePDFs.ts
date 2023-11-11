
import { PDFDocument } from 'pdf-lib';
import { PdfFile, convertAllToLibPdf, fromPDFDocument } from '../wrappers/PdfFile';

export async function mergePDFs(files: PdfFile[]): Promise<PdfFile> {

    await convertAllToLibPdf(files);

    const mergedPdf = await PDFDocument.create(); 

    for (let i = 0; i < files.length; i++) {
        const pdfToMerge = files[i].pdfLib;
        if (!pdfToMerge) continue;

        const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    return fromPDFDocument(mergedPdf);
};