
import { PDFPage } from 'pdf-lib';
import { PdfFile } from '../wrappers/PdfFile';

export type ScaleContentParamsType = {
    file: PdfFile;
    scaleFactor: number|number[];
}

export async function scaleContent(params: ScaleContentParamsType): Promise<PdfFile> {
    const { file, scaleFactor } = params;
    
    const pdfDoc = await file.pdfLibDocument;
    const pages = pdfDoc.getPages();

    if (Array.isArray(scaleFactor)) {
        if (scaleFactor.length != pages.length) {
            throw new Error(`Number of given scale factors '${scaleFactor.length}' is not the same as the number of pages '${pages.length}'`)
        }
        for (let i=0; i<scaleFactor.length; i++) {
            scalePage(pages[i], scaleFactor[i]);
        }
    } else {
        pages.forEach(page => scalePage(page, scaleFactor));
    }

    return file;
};

function scalePage(page: PDFPage, scaleFactor: number) {
    const width = page.getWidth();
    const height = page.getHeight();

    // Scale content
    page.scaleContent(scaleFactor, scaleFactor);
    const scaled_diff = {
        width: Math.round(width - scaleFactor * width),
        height: Math.round(height - scaleFactor * height),
    };

    // Center content in new page format
    page.translateContent(Math.round(scaled_diff.width / 2), Math.round(scaled_diff.height / 2));
}