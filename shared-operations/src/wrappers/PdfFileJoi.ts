import Joi from "joi";
import { PdfFile } from "./PdfFile";

export const JoiPDFFileSchema = Joi.binary().custom((value: Express.Multer.File[] | PdfFile, helpers) => {
    if (!(value instanceof PdfFile)) {
        try {
            return PdfFile.fromMulterFiles(value);
        } catch (error) {
            console.error(error);
            throw new Error('value is not of type PdfFile');
        }
    }
    return value;
}, "pdffile validation");