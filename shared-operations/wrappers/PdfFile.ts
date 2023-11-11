
import { PDFDocument } from 'pdf-lib';

export class PdfFile {
    byteArray: Uint8Array | null;
    pdfLib: PDFDocument | null;
    filename?: string;

    constructor() {    
        this.byteArray = null;
        this.pdfLib = null;
    }   

    async convertToByteArray(): Promise<void> {
        if (this.pdfLib) {
            this.byteArray = await this.pdfLib.save();
            this.pdfLib = null;
        }
    }
    async convertToLibPdf(): Promise<void> {
        if (this.byteArray) {
            this.pdfLib = await PDFDocument.load(this.byteArray, {
                updateMetadata: false,
            });
            this.byteArray = null;
        }
    }
}

export function fromMulterFile(value: Express.Multer.File, filename?: string) {
    return fromUint8Array(value.buffer, filename)
}
export function fromUint8Array(value: Uint8Array, filename?: string) {
    const out = new PdfFile();
    out.byteArray = value;
    out.filename = filename;
    return out;
}
export function fromPDFDocument(value: PDFDocument, filename?: string) {
    const out = new PdfFile();
    out.pdfLib = value;
    out.filename = filename;
    return out;
}

export async function convertAllToByteArray(files: PdfFile[]): Promise<void> {
    const pdfPromises = files.map(s => s.convertToByteArray());
    await Promise.all(pdfPromises);

}

export async function convertAllToLibPdf(files: PdfFile[]): Promise<void> {
    const pdfPromises = files.map(s => s.convertToLibPdf());
    await Promise.all(pdfPromises);

}
