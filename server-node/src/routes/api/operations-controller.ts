
import Operations from '../../utils/pdf-operations';
import { respondWithPdfFile, respondWithPdfFiles, response_mustHaveExactlyOneFile } from '../../utils/endpoint-utils';
import { PdfFile, PdfFileSchema } from '@stirling-pdf/shared-operations/src/wrappers/PdfFile'

import express, { Request, Response, RequestHandler } from 'express';
const router = express.Router();
import multer from 'multer';
const upload = multer();
import Joi from 'joi';

function registerEndpoint(endpoint: string,
                          nameToAppend: string,
                          fileHandler: RequestHandler,
                          operationFunction: (params: any) => Promise<PdfFile|PdfFile[]>,
                          joiSchema: Joi.ObjectSchema<any>
        ): void {
    router.post(endpoint, fileHandler, async function(req: Request, res: Response) {
        const body = req.body;
        if (req.file) {
            body.file = PdfFile.fromMulterFile(req.file);
        }
        if (req.files) {
            if (Array.isArray(req.files))
                body.files = PdfFile.fromMulterFiles(req.files);
            else {
                const flattenedFiles = Object.values(req.files).flatMap(va => va);
                body.files = PdfFile.fromMulterFiles(flattenedFiles);
            }
        }

        console.log(req.body)
        const { error, value } = joiSchema.validate(req.body);
        if (error) {
            res.status(400).send(error.details);
            return;
        }
    
        const processed = await operationFunction(value)

        if (body.files && Array.isArray(processed)) { // MIMO
            respondWithPdfFiles(res, processed, nameToAppend);
        } else if (body.file && Array.isArray(processed)) { // SIMO
            respondWithPdfFiles(res, processed, body.file.filename + nameToAppend);
        } else if (body.files && !Array.isArray(processed)) { // MISO
            respondWithPdfFile(res, processed);
        } else if (body.file && !Array.isArray(processed)) { // SISO
            respondWithPdfFile(res, processed);
        }
    });
}


/////////////////////
// Page Operations //
/////////////////////
registerEndpoint("/merge-pdfs", "", upload.any(), Operations.mergePDFs, Joi.object({
    files: Joi.array().items(PdfFileSchema).required(),
}).required());

registerEndpoint("/split-pdf", "_split", upload.single("file"), Operations.splitPdfByIndex, Joi.object({
    file: PdfFileSchema.required(),
    pageIndexes: Joi.string().required(),
}).required());

registerEndpoint("/rearrange-pages", "", upload.single("file"), Operations.arrangePages, Joi.object({
    file: PdfFileSchema.required(),
    arrangementConfig: Joi.string().required(),
}).required());

registerEndpoint("/rotate-pdf", "", upload.single("file"), Operations.rotatePages, Joi.object({
    file: PdfFileSchema.required(),
    rotation: Joi.alternatives().try(Joi.number(), Joi.array().items(Joi.number())).required(),
}).required());

//Remove Pages
//impose
//Adjust page size/scale
//Auto Split Pages
//Adjust Colours/Contrast
//Crop
//Extract Pages
//PDF to Single large Page


/////////////////////
//     Convert     //
/////////////////////
//Image to PDF
//Convert file to PDF
//URL to PDF
//HTML to PDF
//Markdown to PDF
//PDF to Image
//PDF to Word
//PDF to Presentation
//PDF to Text/RTF
//PDF to HTML
//PDF to PDF/A


/////////////////////
//    Security     //
/////////////////////
//Add Password
//Remove Password
//Change Permissions
//Add Watermark
//Sign with Certificate
//Sanitize
//Auto Redact

/////////////////////
//  Miscellaneous  //
/////////////////////
//OCR
//Add image
//Compress
//Extract Images

registerEndpoint("/update-metadata", "", upload.single("file"), Operations.updateMetadata, Joi.object({
    file: PdfFileSchema.required(),
    deleteAll: Joi.string(),
    author: Joi.string(),
    creationDate: Joi.string(),
    creator: Joi.string(),
    keywords: Joi.string(),
    modificationDate: Joi.string(),
    producer: Joi.string(),
    subject: Joi.string(),
    title: Joi.string(),
    trapped: Joi.string(),
    allRequestParams: Joi.object().pattern(Joi.string(), Joi.string()),
}).required());

//Detect/Split Scanned photos
//Sign
//Flatten
//Repair
//Remove Blank Pages
//Compare/Diff
//Add Page Numbers
//Auto Rename
//Get info
//Show JS

export default router;