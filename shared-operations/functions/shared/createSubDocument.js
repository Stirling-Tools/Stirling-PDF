export async function createSubDocument(pdfDoc, pagesToExtractArray, PDFLib) {
    const subDocument = await PDFLib.PDFDocument.create();

    // Check that array max number is not larger pdf pages number
    if(Math.max(...pagesToExtractArray) >= pdfDoc.getPageCount()) {
        throw new Error(`The PDF document only has ${pdfDoc.getPageCount()} pages and you tried to extract page ${Math.max(...pagesToExtractArray)}`);
    }

    const copiedPages = await subDocument.copyPages(pdfDoc, pagesToExtractArray);

    for (let i = 0; i < copiedPages.length; i++) {
        subDocument.addPage(copiedPages[i]);
    }

    return subDocument.save();
}