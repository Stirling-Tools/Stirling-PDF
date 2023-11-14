
import { PDFDocument } from 'pdf-lib';
import * as PDFJS from 'pdfjs-dist';
import { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import Joi from 'joi';

export class PdfFile {
    byteArray: Uint8Array | null;
    pdfLib: PDFDocument | null;
    pdfJs: PDFDocumentProxy | null;
    filename: string;

    constructor() {    
        this.byteArray = null;
        this.pdfLib = null;
        this.pdfJs = null;
        this.filename = "";
    }   

    async convertToByteArrayFile(): Promise<PdfFile> {
        if (this.byteArray) return this;

        var byteArray: Uint8Array|null = null;
        if (this.pdfLib) {
            byteArray = await this.pdfLib.save();
        } else if (this.pdfJs) {
            byteArray = await this.pdfJs.getData();
        }
        return fromUint8Array(byteArray!, this.filename);
    }
    async convertToPdfLibFile(): Promise<PdfFile> {
        if (this.pdfLib) return this;

        const byteFile = await this.convertToByteArrayFile();
        const pdfLib = await PDFDocument.load(byteFile.byteArray!, {
            updateMetadata: false,
        });
        return fromPdfLib(pdfLib, this.filename);
    }
    async convertToPdfJsFile(): Promise<PdfFile> {
        if (this.pdfJs) return this;

        const byteFile = await this.convertToByteArrayFile();
        const pdfJs = await PDFJS.getDocument(byteFile.byteArray!).promise;
        return fromPdfJs(pdfJs, this.filename);
    }

    async getAsByteArray(): Promise<Uint8Array> {
        const file = await this.convertToByteArrayFile();
        return file.byteArray!;
    }
    async getAsPdfLib(): Promise<PDFDocument> {
        const file = await this.convertToPdfLibFile();
        return file.pdfLib!;
    }
    async getAsPdfJs(): Promise<PDFDocumentProxy> {
        const file = await this.convertToPdfJsFile();
        return file.pdfJs!;
    }
}
export const PdfFileSchema = Joi.any().custom((value, helpers) => {
    if (!(value instanceof PdfFile)) {
        throw new Error('value is not a PdfFile');
    }
    return value;
}, "PdfFile validation");

export function fromMulterFile(value: Express.Multer.File): PdfFile {
    return fromUint8Array(value.buffer, value.originalname)
}
export function fromMulterFiles(values: Express.Multer.File[]): PdfFile[] {
    return values.map(v => fromUint8Array(v.buffer, v.originalname));
}
export function fromUint8Array(value: Uint8Array, filename: string): PdfFile {
    const out = new PdfFile();
    out.byteArray = value;
    out.filename = filename;
    return out;
}
export function fromPdfLib(value: PDFDocument, filename: string): PdfFile {
    const out = new PdfFile();
    out.pdfLib = value;
    out.filename = filename;
    return out;
}
export function fromPdfJs(value: PDFDocumentProxy, filename: string): PdfFile {
    const out = new PdfFile();
    out.pdfJs = value;
    out.filename = filename;
    return out;
}

export async function convertAllToByteArrayFile(files: PdfFile[]): Promise<(PdfFile)[]> {
    const pdfPromises = files.map(s => s.convertToByteArrayFile());
    return await Promise.all(pdfPromises);
}

export async function convertAllToPdfLibFile(files: PdfFile[]): Promise<(PdfFile)[]> {
    const pdfPromises = files.map(s => s.convertToPdfLibFile());
    return await Promise.all(pdfPromises);
}

export async function convertAllToPdfJsFile(files: PdfFile[]): Promise<(PdfFile)[]> {
    const pdfPromises = files.map(s => s.convertToPdfJsFile());
    return await Promise.all(pdfPromises);
}
