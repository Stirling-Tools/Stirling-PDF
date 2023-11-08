
import { PDFDocument, ParseSpeeds } from 'pdf-lib';


export type Metadata = {
    Title: string | null | undefined;       // The title of the document.
    Author: string | null | undefined;      // The author of the document.
    Subject: string | null | undefined;     // The subject of the document.
    Keywords: string[] | null | undefined;  // An array of keywords associated with the document.
    Producer: string | null | undefined;    // The producer of the document.
    Creator: string | null | undefined;     // The creator of the document.
    CreationDate: Date | null | undefined;  // The date when the document was created.
    ModificationDate: Date | null | undefined; // The date when the document was last modified.
}
/**
 * 
 * @param {Uint16Array} snapshot
 * @param {Metadata} metadata - Set property to null or "" to clear, undefined properties will be skipped.
 * @returns Promise<Uint8Array>
 */
export async function editMetadata(snapshot: string | Uint8Array | ArrayBuffer, metadata: Metadata): Promise<Uint8Array> {
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