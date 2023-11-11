
import Operations from '../../utils/pdf-operations';
import { respondWithBinaryPdf, response_mustHaveExactlyOneFile } from '../../utils/endpoint-utils';

import express, { Request, Response } from 'express';
const router = express.Router();
import multer from 'multer';
const upload = multer();
import Joi from 'joi';

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

    const rotated = await Operations.rotatePages(req.file.buffer, value.angle)
    const newFilename = appendToFilename(req.file.originalname, '_rotated');
    respondWithBinaryPdf(res, rotated, newFilename);
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

    const processed = await Operations.updateMetadata(req.file.buffer, value)
    const newFilename = appendToFilename(req.file.originalname, '_edited-metadata');
    respondWithBinaryPdf(res, processed, newFilename);
});

/**
 * appends a string before the last '.' of the given filename
 */
function appendToFilename(filename: string, str: string) {
    return filename.replace(/(\.[^.]+)$/, str+'$1')
}

export default router;