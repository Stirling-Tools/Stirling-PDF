
import { PDFDocument, ParseSpeeds } from 'pdf-lib';

export async function scalePage(snapshot, pageSize) {
    // Load the original PDF file
    const pdfDoc = await PDFDocument.load(snapshot, {
        parseSpeed: ParseSpeeds.Fastest,
    });

    const new_size = pageSize;

    const pages = pdfDoc.getPages();

    pages.forEach(page => {
        // Change page size
        page.setSize(new_size.width, new_size.height);
    });

    // Serialize the modified document
    return pdfDoc.save();
};

export const PageSize = {
    a4: {
        width: 594.96,
        height: 841.92
    },
    letter: {
        width: 612,
        height: 792
    }
};