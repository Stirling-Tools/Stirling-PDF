
import Operations from '../../utils/pdf-operations';
import { respondWithPdfFile, response_mustHaveExactlyOneFile } from '../../utils/endpoint-utils';
import { PdfFile, PdfFileSchema } from '@stirling-pdf/shared-operations/src/wrappers/PdfFile'

import express, { Request, Response, RequestHandler } from 'express';
const router = express.Router();
import multer from 'multer';
const upload = multer();
import Joi, { array } from 'joi';

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
        if (Array.isArray(processed)) {
            // TODO zip multiple files
        } else {
            processed.filename = appendToFilename(processed.filename, nameToAppend);
            respondWithPdfFile(res, processed);
        }
    });
}

/**
 * appends a string before the last '.' of the given filename
 */
function appendToFilename(filename: string, str: string) {
    return filename.replace(/(\.[^.]+)$/, str+'$1')
}

registerEndpoint("/merge-pdfs", "_merged", upload.single("file"), Operations.mergePDFs, Joi.object({
    files: Joi.array().items(PdfFileSchema).required(),
}).required())

registerEndpoint("/rotate-pdf", "_rotated", upload.single("file"), Operations.rotatePages, Joi.object({
    file: PdfFileSchema.required(),
    rotation: Joi.alternatives().try(Joi.number(), Joi.array().items(Joi.number())).required(),
}).required())

registerEndpoint("/update-metadata", "_edited-metadata", upload.single("file"), Operations.updateMetadata, Joi.object({
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
}).required())

export default router;