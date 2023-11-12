
import { degrees } from 'pdf-lib';
import { PdfFile, fromPdfLib } from '../wrappers/PdfFile';

export async function rotatePages(file: PdfFile, rotation: number|number[]): Promise<PdfFile> {
    const pdfDoc = await file.getAsPdfLib();
    const pages = pdfDoc.getPages();

    if (Array.isArray(rotation)) {
        if (rotation.length != pages.length) {
            throw new Error(`Number of given rotations '${rotation.length}' is not the same as the number of pages '${pages.length}'`)
        }
        for (let i=0; i<rotation.length; i++) {
            const oldRotation = pages[i].getRotation().angle
            pages[i].setRotation(degrees(oldRotation + rotation[i]))
        }
    } else {
        pages.forEach(page => {
            // Change page size
            const oldRotation = page.getRotation().angle
            page.setRotation(degrees(oldRotation + rotation))
        });
    }

    return fromPdfLib(pdfDoc, file.filename);
};