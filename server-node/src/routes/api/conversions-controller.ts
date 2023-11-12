
import { respondWithPdfFile, response_mustHaveExactlyOneFile, response_dependencyNotConfigured } from '../../utils/endpoint-utils';
import { fileToPdf, isLibreOfficeInstalled } from '../../utils/libre-office-utils';

import express, { Request, Response } from 'express';
const router = express.Router();
import multer from 'multer';
const upload = multer();
import Joi from 'joi';

router.post('/file-to-pdf', upload.single("file"), async function(req: Request, res: Response) {
    if (!req.file) {
        response_mustHaveExactlyOneFile(res);
        return;
    }

    const isInstalled = await isLibreOfficeInstalled();
    if (isInstalled) {
        const outputFile = await fileToPdf(req.file.buffer, req.file.originalname);
        respondWithPdfFile(res, outputFile);
        return;
    }

    response_dependencyNotConfigured(res, "LibreOffice");
});

export default router;
