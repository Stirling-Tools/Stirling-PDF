
import PDFLib from 'pdf-lib';

export const mergePDFs = async (snapshots) => {

    const mergedPdf = await PDFLib.PDFDocument.create(); 

    for (let i = 0; i < snapshots.length; i++) {
        const pdfToMerge = await PDFLib.PDFDocument.load(snapshots[i]);

        const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    return mergedPdf.save();
};