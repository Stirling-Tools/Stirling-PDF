
import { PDFPage } from 'pdf-lib';
import { PdfFile, fromPdfLib } from '../wrappers/PdfFile';

export async function scalePage(file: PdfFile, pageSize: {width?:number,height?:number}|{width?:number,height?:number}[]): Promise<PdfFile> {
    const pdfDoc = await file.getAsPdfLib();
    const pages = pdfDoc.getPages();

    if (Array.isArray(pageSize)) {
        if (pageSize.length != pages.length) {
            throw new Error(`Number of given sizes '${pageSize.length}' is not the same as the number of pages '${pages.length}'`)
        }
        for (let i=0; i<pageSize.length; i++) {
            resize(pages[i], pageSize[i]);
        }
    } else {
        pages.forEach(page => resize(page, pageSize));
    }
    
    return fromPdfLib(pdfDoc, file.filename);
};

function resize(page: PDFPage, newSize: {width?:number,height?:number}) {
    const calculatedSize = calculateSize(page, newSize);
    page.setSize(calculatedSize.width, calculatedSize.height);

    const xRatio = calculatedSize.width / page.getWidth();
    const yRatio = calculatedSize.height / page.getHeight();
    page.scaleContent(xRatio, yRatio);
}

function calculateSize(page: PDFPage, newSize: {width?:number,height?:number}): {width:number,height:number} {
    if (!newSize.width && !newSize.height){
        throw new Error(`Sizes '${newSize}' cannot have null width and null height`);
    } else if (!newSize.width && newSize.height) {
        const oldSize = page.getSize();
        const ratio = oldSize.width / oldSize.height;
        return { width: newSize.height * ratio, height: newSize.height };
    } else if (newSize.width && !newSize.height) {
        const oldSize = page.getSize();
        const ratio = oldSize.height / oldSize.width;
        return { width: newSize.width, height: newSize.width * ratio };
    }
    return { width: newSize.width!, height: newSize.height! };
}

export const PageSize = Object.freeze({
    a4: {
        width: 594.96,
        height: 841.92
    },
    letter: {
        width: 612,
        height: 792
    }
});