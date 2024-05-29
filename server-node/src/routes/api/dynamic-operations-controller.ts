import express, { Request, Response } from "express";
const router = express.Router();
import multer from "multer";
const upload = multer();
import { getOperatorByName } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";

import { PdfFile } from "@stirling-pdf/shared-operations/src/wrappers/PdfFile";
import { respondWithPdfFiles } from "../../utils/response-utils";
import { Action } from "@stirling-pdf/shared-operations/declarations/Action";
import { JoiPDFFileSchema } from "@stirling-pdf/shared-operations/src/wrappers/PdfFileJoi";

router.post("/:func", upload.array("file"), async function(req: Request, res: Response) {
    await handleEndpoint(req, res);
});

router.post("/:dir/:func", upload.array("file"), async function(req: Request, res: Response) {
    await handleEndpoint(req, res);
});

async function handleEndpoint(req: Request, res: Response) {
    if(!req.files || req.files.length == 0) {
        res.status(400).json({error: "no input file(s) were provided"});
        return;
    }

    const validationResults = await JoiPDFFileSchema.validateAsync(req.files);
    if(validationResults.error) {
        res.status(400).json({error: "PDF validation failed", details: validationResults.error.message});
        return;
    }
    const pdfFiles: PdfFile[] = validationResults.value;

    const operator = await getOperatorByName(req.params.func);

    if(operator) {
        const action: Action = {type: req.params.func, values: req.body};

        const validationResults = operator.schema.validate({input: pdfFiles, values: action.values});

        if(validationResults.error) {
            res.status(400).json({error: "Value validation failed", details: validationResults.error.message});
        }
        else {
            action.values = validationResults.value.values;
            const operation = new operator(action);
            operation.run(validationResults.value.input, (progress) => {}).then(pdfFiles => {
                respondWithPdfFiles(res, pdfFiles, req.params.func + "_result");
            });
        }
    }
    else {
        res.status(400).json({error: `the operator of type ${req.params.func} does not exist`});
    }
}

export default router;
