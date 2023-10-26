
import { PDFDocument, ParseSpeeds, degrees } from 'pdf-lib';

export async function rotatePages(snapshot, rotation) {
    // Load the original PDF file
    const pdfDoc = await PDFDocument.load(snapshot, {
        parseSpeed: ParseSpeeds.Fastest,
    });

    const pages = pdfDoc.getPages();

    pages.forEach(page => {
        // Change page size
        page.setRotation(degrees(rotation))
    });

    // Serialize the modified document
    return pdfDoc.save();
};