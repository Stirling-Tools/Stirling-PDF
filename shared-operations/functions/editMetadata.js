
import PDFLib from 'pdf-lib';

/**
 * @typedef {Object} Metadata
 * @property {string | null | undefined} Title - The title of the document.
 * @property {string | null | undefined} Author - The author of the document.
 * @property {string | null | undefined} Subject - The subject of the document.
 * @property {string[] | null | undefined} Keywords - An array of keywords associated with the document.
 * @property {string | null | undefined} Producer - The producer of the document.
 * @property {string | null | undefined} Creator - The creator of the document.
 * @property {Date | null | undefined} CreationDate - The date when the document was created.
 * @property {Date | null | undefined} ModificationDate - The date when the document was last modified.
 */

/**
 * 
 * @param {Uint16Array} snapshot
 * @param {Metadata} metadata - Set property to null or "" to clear, undefined properties will be skipped.
 * @param {PDFLib} PDFLib
 * @returns 
 */
export async function editMetadata(snapshot, metadata) {
    // Load the original PDF file
    const pdfDoc = await PDFLib.PDFDocument.load(snapshot, {
        parseSpeed: PDFLib.ParseSpeeds.Fastest,
    });

    if(metadata.Title !== undefined)
        pdfDoc.setTitle(metadata.Title);

    if(metadata.Author !== undefined)
        pdfDoc.setAuthor(metadata.Author)

    if(metadata.Subject !== undefined)
        pdfDoc.setSubject(metadata.Subject)
    
    if(metadata.Keywords !== undefined)
        pdfDoc.setKeywords(metadata.Keywords)
    
    if(metadata.Producer !== undefined)
        pdfDoc.setProducer(metadata.Producer)

    if(metadata.Creator !== undefined)
        pdfDoc.setCreator(metadata.Creator)

    if(metadata.CreationDate !== undefined)
        pdfDoc.setCreationDate(metadata.CreationDate)

    if(metadata.ModificationDate !== undefined)
        pdfDoc.setModificationDate(metadata.ModificationDate)

    // Serialize the modified document
    return pdfDoc.save();
};