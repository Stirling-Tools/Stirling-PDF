import Joi from "@stirling-tools/joi";
import { PdfFile } from "./PdfFile";

export const JoiPDFFileSchema = Joi.custom((value: Express.Multer.File[] /* <- also handles single files */ | PdfFile[] | PdfFile, helpers) => {
    if (Array.isArray(value)) {
        if(isPdfFileArray(value))
            return value;
        else { // File(s)
            const firstWrongFile = value.find(f => f.mimetype != "application/pdf")
            if(firstWrongFile) 
                throw new Error(`at least one of the files provided doesn't seem to be a PDF. Got the file ${JSON.stringify(firstWrongFile)} instead.`);

            return PdfFile.fromMulterFiles(value);
        }
    }
    else {
        if (value instanceof PdfFile) {
            return value;
        }
        else { 
            throw new Error("an invalid type (unhandeled, non-file-type) was provided to pdf validation process. Please report this to maintainers.");
        }
    }
}, "pdffile");

function isPdfFileArray(value: any[]): value is PdfFile[] { // "is" is a ts-typeguard - https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
    return value.every((e) => e instanceof PdfFile);
} 