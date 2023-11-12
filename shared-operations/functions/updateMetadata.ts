
import { PdfFile, fromPdfLib } from '../wrappers/PdfFile';

export type Metadata = {
    deleteAll?: boolean,        // Delete all metadata if set to true
    author?: string,            // The author of the document
    creationDate?: Date,        // The creation date of the document (format: yyyy/MM/dd HH:mm:ss)
    creator?: string,           // The creator of the document
    keywords?: string,          // The keywords for the document
    modificationDate?: Date,    // The modification date of the document (format: yyyy/MM/dd HH:mm:ss)
    producer?: string,          // The producer of the document
    subject?: string,           // The subject of the document
    title?: string,             // The title of the document
    //trapped?: string,           // The trapped status of the document
    //allRequestParams?: {[key: string]: [key: string]},  // Map list of key and value of custom parameters. Note these must start with customKey and customValue if they are non-standard
}

export async function updateMetadata(file: PdfFile, metadata: Metadata|null): Promise<PdfFile> {
    const pdfDoc = await file.getAsPdfLib();

    if (!metadata || metadata.deleteAll) {
        pdfDoc.setAuthor("");
        pdfDoc.setCreationDate(new Date(0))
        pdfDoc.setCreator("")
        pdfDoc.setKeywords([])
        pdfDoc.setModificationDate(new Date(0))
        pdfDoc.setProducer("")
        pdfDoc.setSubject("")
        pdfDoc.setTitle("")
    }
    if (!metadata) {
        return fromPdfLib(pdfDoc, file.filename);
    }

    if(metadata.author)
        pdfDoc.setAuthor(metadata.author);
    if(metadata.creationDate)
        pdfDoc.setCreationDate(metadata.creationDate)
    if(metadata.creator)
        pdfDoc.setCreator(metadata.creator)
    if(metadata.keywords)
        pdfDoc.setKeywords(metadata.keywords.split(","))
    if(metadata.modificationDate)
        pdfDoc.setModificationDate(metadata.modificationDate)
    if(metadata.producer)
        pdfDoc.setProducer(metadata.producer)
    if(metadata.subject)
        pdfDoc.setSubject(metadata.subject)
    if(metadata.title)
        pdfDoc.setTitle(metadata.title)

    // TODO add trapped and custom metadata. May need another library

    return fromPdfLib(pdfDoc, file.filename);
};
