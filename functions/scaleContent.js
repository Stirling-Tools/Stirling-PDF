import { PDFDocument, ParseSpeeds } from 'pdf-lib'

export const scaleContent = async (snapshot, scale_factor) => {
    // Load the original PDF file
    const pdfDoc = await PDFDocument.load(snapshot, {
        parseSpeed: ParseSpeeds.Fastest,
    });

    const pages = pdfDoc.getPages();

    pages.forEach(page => {
        const width = page.getWidth();
        const height = page.getHeight();
        
        // Scale content
        page.scaleContent(scale_factor, scale_factor);
        const scaled_diff = {
            width: Math.round(width - scale_factor * width),
            height: Math.round(height - scale_factor * height),
        };

        // Center content in new page format
        page.translateContent(Math.round(scaled_diff.width / 2), Math.round(scaled_diff.height / 2));

    });

    // Serialize the modified document
    return pdfDoc.save();
};