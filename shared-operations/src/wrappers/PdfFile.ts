import * as PDFJS from 'pdfjs-dist';
import type { PDFDocumentProxy as PDFJSDocument } from 'pdfjs-dist/types/src/display/api';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import Joi from 'joi';

export enum RepresentationType {
    Uint8Array,
    PDFLibDocument,
    PDFJSDocument
}

export class PdfFile {
    private representation: Uint8Array | PDFLibDocument | PDFJSDocument;
    private representationType: RepresentationType;
    originalFilename: string;
    filename: string;

    get uint8Array() : Promise<Uint8Array> {
        switch (this.representationType) {
            case RepresentationType.Uint8Array:
                return new Promise((resolve) => {
                    resolve(this.representation as Uint8Array);
                });
            case RepresentationType.PDFLibDocument:
                return new Promise(async (resolve) => {
                    var uint8Array = await (this.representation as PDFLibDocument).save();
                    this.uint8Array = uint8Array;
                    resolve(uint8Array);
                });
            case RepresentationType.PDFJSDocument:
                return new Promise(async (resolve) => {
                    var uint8Array = await (this.representation as PDFJSDocument).getData();
                    this.uint8Array = uint8Array;
                    resolve(uint8Array);
                });
            default:
                console.error("unhandeled PDF type: " + typeof this.representation as string);
                throw Error("unhandeled PDF type");
        } 
    }
    set uint8Array(value: Uint8Array) {
        this.representation = value;
        this.representationType = RepresentationType.Uint8Array;
    }

    get pdfLibDocument() : Promise<PDFLibDocument> {
        switch (this.representationType) {
            case RepresentationType.PDFLibDocument:
                return new Promise((resolve) => {
                    resolve(this.representation as PDFLibDocument);
                });
            default:
                return new Promise(async (resolve) => {
                    var uint8Array = await this.uint8Array;
                    var pdfLibDoc = await PDFLibDocument.load(uint8Array, {
                        updateMetadata: false,
                    });
                    this.pdfLibDocument = pdfLibDoc;
                    resolve(pdfLibDoc);
                });
        } 
    }
    set pdfLibDocument(value: PDFLibDocument) {
        this.representation = value;
        this.representationType = RepresentationType.PDFLibDocument;
    }

    get pdfJsDocument() : Promise<PDFJSDocument> {
        switch (this.representationType) {
            case RepresentationType.PDFJSDocument:
                return new Promise((resolve) => {
                    resolve(this.representation as PDFJSDocument);
                });
            default:
                return new Promise(async (resolve) => {
                    const pdfjsDoc = await PDFJS.getDocument(await this.uint8Array).promise;
                    this.pdfJsDocument = pdfjsDoc;
                    resolve(pdfjsDoc);
                });
        } 
    }
    set pdfJsDocument(value: PDFJSDocument) {
        this.representation = value;
        this.representationType = RepresentationType.PDFJSDocument;
    }

    constructor(originalFilename: string, representation: Uint8Array | PDFLibDocument | PDFJSDocument, representationType: RepresentationType, filename?: string) {
        if (originalFilename.toLowerCase().endsWith(".pdf"))
            originalFilename = originalFilename.slice(0, -4);
        this.originalFilename = originalFilename;
        
        this.filename = filename ? filename : originalFilename;
        if (this.filename.toLowerCase().endsWith(".pdf"))
        this.filename = this.filename.slice(0, -4);

        this.representation = representation;
        this.representationType = representationType;
    }

    static fromMulterFile(value: Express.Multer.File): PdfFile {
        return new PdfFile(value.originalname, value.buffer as Uint8Array, RepresentationType.Uint8Array);
    }
    static fromMulterFiles(values: Express.Multer.File[]): PdfFile[] {
        return values.map(v => PdfFile.fromMulterFile(v));
    }

    static async cacheAsUint8Arrays(files: PdfFile[]): Promise<Map<PdfFile, Uint8Array>> {
        const docCache = new Map<PdfFile, Uint8Array>();
        await Promise.all(files.map(async (file) => {
            const pdfLibDocument = await file.uint8Array;
            docCache.set(file, pdfLibDocument);
        }));
        return docCache;
    }
    static async cacheAsPdfLibDocuments(files: PdfFile[]): Promise<Map<PdfFile, PDFLibDocument>> {
        const docCache = new Map<PdfFile, PDFLibDocument>();
        await Promise.all(files.map(async (file) => {
            const pdfLibDocument = await file.pdfLibDocument;
            docCache.set(file, pdfLibDocument);
        }));
        return docCache;
    }
    static async cacheAsPdfJsDocuments(files: PdfFile[]): Promise<Map<PdfFile, PDFJSDocument>> {
        const docCache = new Map<PdfFile, PDFJSDocument>();
        await Promise.all(files.map(async (file) => {
            const pdfLibDocument = await file.pdfJsDocument;
            docCache.set(file, pdfLibDocument);
        }));
        return docCache;
    }
}

export const PdfFileSchema = Joi.any().custom((value) => {
    if (!(value instanceof PdfFile)) {
        throw new Error('value is not a PdfFile');
    }
    return value;
}, "PdfFile validation");
