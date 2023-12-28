import Joi from "joi";
import { PdfFile } from "./PdfFile";

export const JoiPDFFileSchema = Joi.custom((value: Express.Multer.File | Express.Multer.File[] | PdfFile | PdfFile[], helpers) => {
    if (Array.isArray(value)) {
        if(isPdfFileArray(value))
            return value;
        else { // File(s)
            if(value.some(f => f.mimetype != "application/pdf")) 
                throw new Error("at least one of the files provided doesn't seem to be a PDF.");

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
}, "pdffile validation");

function isPdfFileArray(value: any): value is PdfFile[] {
    return value.every((e: PdfFile) => e instanceof PdfFile)
} 
