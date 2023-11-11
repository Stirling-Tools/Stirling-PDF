
import { PDFDocument, ParseSpeeds } from 'pdf-lib';


export type Metadata = {
    Title?: string;       // The title of the document.
    Author?: string;      // The author of the document.
    Subject?: string;     // The subject of the document.
    Keywords?: string[];  // An array of keywords associated with the document.
    Producer?: string;    // The producer of the document.
    Creator?: string;     // The creator of the document.
    CreationDate?: Date;  // The date when the document was created.
    ModificationDate?: Date; // The date when the document was last modified.
}
/**
 * 
 * @param {Uint16Array} snapshot
 * @param {Metadata} metadata - Set property to null or "" to clear, undefined properties will be skipped.
 * @returns Promise<Uint8Array>
 */
export async function updateMetadata(snapshot: string | Uint8Array | ArrayBuffer, metadata: Metadata): Promise<Uint8Array> {
    // Load the original PDF file
    const pdfDoc = await PDFDocument.load(snapshot, {
        parseSpeed: ParseSpeeds.Fastest,
    });

    if(metadata.Title)
        pdfDoc.setTitle(metadata.Title);

    if(metadata.Author)
        pdfDoc.setAuthor(metadata.Author)

    if(metadata.Subject)
        pdfDoc.setSubject(metadata.Subject)
    
    if(metadata.Keywords)
        pdfDoc.setKeywords(metadata.Keywords)
    
    if(metadata.Producer)
        pdfDoc.setProducer(metadata.Producer)

    if(metadata.Creator)
        pdfDoc.setCreator(metadata.Creator)

    if(metadata.CreationDate)
        pdfDoc.setCreationDate(metadata.CreationDate)

    if(metadata.ModificationDate)
        pdfDoc.setModificationDate(metadata.ModificationDate)

    // Serialize the modified document
    return pdfDoc.save();
};