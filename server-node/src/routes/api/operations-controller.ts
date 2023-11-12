
import Operations from '../../utils/pdf-operations';
import { respondWithPdfFile, response_mustHaveExactlyOneFile } from '../../utils/endpoint-utils';
import { PdfFile, fromMulterFile } from '@stirling-pdf/shared-operations/src/wrappers/PdfFile'

import express, { Request, Response } from 'express';
const router = express.Router();
import multer from 'multer';
const upload = multer();
import Joi from 'joi';

router.post('/merge-pdfs', upload.single("pdfFile"), async function(req: Request, res: Response) {
    const schema = Joi.object({
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
    }).required();
    const { error, value } = schema.validate(req.body);
    if (error) {
        res.status(400).send(error.details);
        return;
    }
    if (!req.file) {
        response_mustHaveExactlyOneFile(res);
        return;
    }

    const arrayFile = fromMulterFile(req.file);
    const processed = await Operations.updateMetadata(arrayFile, value)
    const newFilename = appendToFilename(req.file.originalname, '_edited-metadata');
    respondWithPdfFile(res, processed);
});

router.post('/rotate-pdf', upload.single("pdfFile"), async function(req: Request, res: Response) {
    const schema = Joi.object({
        angle: Joi.number().required()
    });
    const { error, value } = schema.validate(req.body);
    if (error) {
        res.status(400).send(error.details);
        return;
    }
    if (!req.file) {
        response_mustHaveExactlyOneFile(res);
        return;
    }

    const arrayFile = fromMulterFile(req.file);
    const rotated = await Operations.rotatePages(arrayFile, value.angle)
    rotated.filename = appendToFilename(arrayFile.filename, '_rotated');
    respondWithPdfFile(res, rotated);
});

router.post('/update-metadata', upload.single("pdfFile"), async function(req: Request, res: Response) {
    const schema = Joi.object({
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
    }).required();
    const { error, value } = schema.validate(req.body);
    if (error) {
        res.status(400).send(error.details);
        return;
    }
    if (!req.file) {
        response_mustHaveExactlyOneFile(res);
        return;
    }

    const arrayFile = fromMulterFile(req.file);
    const processed = await Operations.updateMetadata(arrayFile, value)
    processed.filename = appendToFilename(arrayFile.filename, '_edited-metadata');
    respondWithPdfFile(res, processed);
});

/**
 * appends a string before the last '.' of the given filename
 */
function appendToFilename(filename: string, str: string) {
    return filename.replace(/(\.[^.]+)$/, str+'$1')
}

export default router;