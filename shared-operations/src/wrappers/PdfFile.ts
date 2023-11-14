import * as PDFJS from 'pdfjs-dist';
import { PDFDocumentProxy as PDFJSDocument } from 'pdfjs-dist/types/src/display/api';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';

import Joi from 'joi';

export class PdfFile {
    private representation: Uint8Array | PDFLibDocument | PDFJSDocument;
    originalFilename: string;
    filename: string;

    get uint8Array() : Promise<Uint8Array> {
        switch (this.representation.constructor) {
            case Uint8Array:
                return new Promise((resolve, reject) => {
                    resolve(this.representation as Uint8Array);
                });
            case PDFLibDocument:
                return (this.representation as PDFLibDocument).save();
            case PDFJSDocument:
                return (this.representation as PDFJSDocument).getData();
            default:
                throw Error("unhandeled PDF type");
        } 
    }
    set uint8Array(value: Uint8Array) {
        this.representation = value;
    }

    get pdflibDocument() : Promise<PDFLibDocument> {
        switch (this.representation.constructor) {
            case PDFLibDocument: // PDFLib
                return new Promise((resolve, reject) => {
                    resolve(this.representation as PDFLibDocument);
                });
            default:
                return new Promise(async (resolve, reject) => {
                    resolve(PDFLibDocument.load(await this.uint8Array, {
                        updateMetadata: false,
                    }));
                });
        } 
    }
    set pdflibDocument(value: PDFLibDocument) {
        this.representation = value;
    }

    get pdfjsDocuemnt() : Promise<PDFJSDocument> {
        switch (this.representation.constructor) {
            case PDFJSDocument:
                return new Promise((resolve, reject) => {
                    resolve(this.representation as PDFJSDocument);
                });
            default:
                return new Promise(async (resolve, reject) => {
                    resolve(await PDFJS.getDocument(await this.uint8Array).promise);
                });
        } 
    }
    set pdfjsDocuemnt(value: PDFJSDocument) {
        this.representation = value;
    }

    constructor(originalFilename: string, representation: Uint8Array | PDFLibDocument | PDFJSDocument, filename?: string) {
        this.originalFilename = originalFilename;
        this.filename = filename ? filename : originalFilename;

        this.representation = representation;
    }

    static fromMulterFile(value: Express.Multer.File): PdfFile {
        return new PdfFile(value.originalname, value.buffer as Uint8Array)
    }
    static fromMulterFiles(values: Express.Multer.File[]): PdfFile[] {
        return values.map(v => PdfFile.fromMulterFile(v));
    }
}

export const PdfFileSchema = Joi.any().custom((value, helpers) => {
    if (!(value instanceof PdfFile)) {
        throw new Error('value is not a PdfFile');
    }
    return value;
}, "PdfFile validation");