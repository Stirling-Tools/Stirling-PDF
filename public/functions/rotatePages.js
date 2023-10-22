export async function rotatePages (snapshot, rotation, PDFLib) {
    // Load the original PDF file
    const pdfDoc = await PDFLib.PDFDocument.load(snapshot, {
        parseSpeed: PDFLib.ParseSpeeds.Fastest,
    });

    const pages = pdfDoc.getPages();

    pages.forEach(page => {
        // Change page size
        page.setRotation(PDFLib.degrees(rotation))
    });

    // Serialize the modified document
    return pdfDoc.save();
};