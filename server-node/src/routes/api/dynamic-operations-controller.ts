import express, { Request, Response } from 'express';
const router = express.Router();
import multer from 'multer';
const upload = multer();
import { getOperatorByName } from '@stirling-pdf/shared-operations/src/workflow/getOperatorByName';
import { Operator } from '@stirling-pdf/shared-operations/src/functions';

import { PdfFile } from '@stirling-pdf/shared-operations/src/wrappers/PdfFile';
import { respondWithPdfFiles } from 'utils/endpoint-utils';

router.post('/:func', upload.array("file"), async function(req: Request, res: Response) {
    handleEndpoint(req, res);
});

router.post('/:dir/:func', upload.array("file"), async function(req: Request, res: Response) {
    handleEndpoint(req, res);
});

function handleEndpoint(req: Request, res: Response) {
    if(!req.files || req.files.length == 0) {
        res.status(400).json({error: "no input file(s) were provided"})
        return;
    }

    let pdfFiles: PdfFile[] = [];
    if (Array.isArray(req.files))
        pdfFiles = PdfFile.fromMulterFiles(req.files);
    else {
        pdfFiles = PdfFile.fromMulterFiles(Object.values(req.files).flatMap(va => va));
    }

    const operator = getOperatorByName(req.params.func);
    if(operator) {
        const operation = new operator({type: req.params.func, values: req.body});
        const validationResults = operation.validate();
        if(validationResults.valid) {
            operation.run(pdfFiles, (progress) => {}).then(pdfFiles => {
                respondWithPdfFiles(res, pdfFiles, req.params.func + "_result");
            })
        }
        else {
            res.status(400).json(validationResults);
        }
    }
    else {
        res.status(400).json({error: `the operator of type ${req.params.func} does not exist`})
    }
}

export default router;
