
import { PDFDocument, ParseSpeeds, degrees } from 'pdf-lib';

export async function rotatePages(snapshot: string | Uint8Array | ArrayBuffer, rotation: number): Promise<Uint8Array> {
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