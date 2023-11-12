
import { PDFDocument } from 'pdf-lib';
import { PdfFile, convertAllToPdfLibFile, fromPdfLib } from '../wrappers/PdfFile';

export async function mergePDFs(files: PdfFile[]): Promise<PdfFile> {

    const pdfLibFiles = await convertAllToPdfLibFile(files);

    const mergedPdf = await PDFDocument.create(); 

    for (let i = 0; i < pdfLibFiles.length; i++) {
        const pdfToMerge = await pdfLibFiles[i].getAsPdfLib();
        const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    return fromPdfLib(mergedPdf, files[0].filename);
};