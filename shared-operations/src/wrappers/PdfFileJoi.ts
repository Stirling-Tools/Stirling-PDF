import Joi from "joi";
import { PdfFile } from "./PdfFile";

export const JoiPDFFileSchema = Joi.binary().custom((value: Express.Multer.File[] | PdfFile | PdfFile[], helpers) => {
    if (value instanceof PdfFile) {
        return value;
    }
    else if (Array.isArray(value)) {
        if(value.every((e) => e instanceof PdfFile))
            return value;
        else
            throw new Error("Some elements in the array are not of type PdfFile");
    }
    else {
        try {
            return PdfFile.fromMulterFiles(value);
        } catch (error) {
            console.error(error);
            throw new Error('value is not of type PdfFile');
        }
    }
}, "pdffile validation");