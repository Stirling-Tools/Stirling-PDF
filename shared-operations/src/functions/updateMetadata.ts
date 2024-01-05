
import { PdfFile } from "../wrappers/PdfFile";

export interface UpdateMetadataParams {
    file: PdfFile,
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

export async function updateMetadata(params: UpdateMetadataParams): Promise<PdfFile> {
    const pdfDoc = await params.file.pdfLibDocument;

    if (params.deleteAll) {
        pdfDoc.setAuthor("");
        pdfDoc.setCreationDate(new Date(0));
        pdfDoc.setCreator("");
        pdfDoc.setKeywords([]);
        pdfDoc.setModificationDate(new Date(0));
        pdfDoc.setProducer("");
        pdfDoc.setSubject("");
        pdfDoc.setTitle("");
    }

    if(params.author)
        pdfDoc.setAuthor(params.author);
    if(params.creationDate)
        pdfDoc.setCreationDate(params.creationDate);
    if(params.creator)
        pdfDoc.setCreator(params.creator);
    if(params.keywords)
        pdfDoc.setKeywords(params.keywords.split(","));
    if(params.modificationDate)
        pdfDoc.setModificationDate(params.modificationDate);
    if(params.producer)
        pdfDoc.setProducer(params.producer);
    if(params.subject)
        pdfDoc.setSubject(params.subject);
    if(params.title)
        pdfDoc.setTitle(params.title);

    // TODO add trapped and custom metadata. May need another library

    params.file.filename += "_updatedMetadata";
    return params.file;
}
