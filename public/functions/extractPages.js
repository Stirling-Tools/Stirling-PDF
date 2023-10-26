import { createSubDocument } from "./shared/createSubDocument.js";

export async function extractPages(snapshot, pagesToExtractArray, PDFLib) {
    const pdfDoc = await PDFLib.PDFDocument.load(snapshot)

    // TODO: invent a better format for pagesToExtractArray and convert it.
    return createSubDocument(pdfDoc, pagesToExtractArray, PDFLib);
};