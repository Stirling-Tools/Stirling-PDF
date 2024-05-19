import express, { Request, Response } from "express";
import crypto from "crypto";
import multer from "multer";
const upload = multer();

import { traverseOperations } from "@stirling-pdf/shared-operations/src/workflow/traverseOperations";
import { PdfFile, RepresentationType } from "@stirling-pdf/shared-operations/src/wrappers/PdfFile";
import { respondWithPdfFiles } from "../../utils/endpoint-utils";
import { JoiPDFFileSchema } from "@stirling-pdf/shared-operations/src/wrappers/PdfFileJoi";

interface Workflow {
    eventStream?: express.Response,
    result?: PdfFile[],
    finished: boolean,
    createdAt: EpochTimeStamp,
    finishedAt?: EpochTimeStamp,
    error?: { type: number, error: string, stack?: string }
    // TODO: When auth is implemented: owner
}

const activeWorkflows: Record<string, Workflow> = {};

const router = express.Router();

router.post("/:workflowUuid?", [
    upload.array("files"),
    async (req: Request, res: Response) => {
        // TODO: Maybe replace with another validator
        if(req.files?.length == 0) {
            res.status(400).json({"error": "No files were uploaded."});
            return;
        }
 
        try {
            var workflow = JSON.parse(req.body.workflow);
        } catch (err) {
            if (err instanceof Error) {
                console.error("malformed workflow-json was provided", err.message);
                res.status(400).json({error: "Malformed workflow-JSON was provided. See Server-Logs for more info", details: err.message});
                return;
            } else {
                throw err;
            }
        }

        if(!workflow.actions) {
            res.status(400).json({error: "The provided workflow does not contain any actions."});
            return
        }

        const validationResults = await JoiPDFFileSchema.validateAsync(req.files);
        if(validationResults.error) {
            res.status(400).json({error: "PDF validation failed", details: validationResults.error.message});
            return;
        }
        const inputs: PdfFile[] = validationResults;

        // Allow option to do it synchronously and just make a long request
        if(req.body.async === "false") {
            console.log("Don't do async");

            // TODO: Check if file type == inputType for operator

            traverseOperations(workflow.actions, inputs, (state) => {
                console.log("State: ", state);
            }).then(async (pdfResults) => {
                console.log("Download");
                await respondWithPdfFiles(res, pdfResults, "workflow-results");
            }).catch((err) => {
                if(err.validationError) {
                    // Bad Request
                    res.status(400).json({error: err});
                }
                else if (err instanceof Error) {
                    console.error("Internal Server Error", err);
                    // Internal Server Error
                    res.status(500).json({error: err.message, stack: err.stack});
                } else {
                    throw err;
                }
            });
        }
        else {
            console.log("Start Async Workflow");
            // TODO: UUID collision checks
            let workflowID = req.params.workflowUuid;
            if(!workflowID)
                workflowID = generateWorkflowID();

            activeWorkflows[workflowID] = {
                createdAt: Date.now(),
                finished: false
            };
            const activeWorkflow = activeWorkflows[workflowID];

            res.status(200).json({
                "workflowID": workflowID,
                "data-recieved": {
                    "fileCount": inputs.length,
                    "workflow": workflow
                }
            });

            // TODO: Check if file type == inputType for operator

            traverseOperations(workflow.actions, inputs, (state) => {
                console.log("State: ", state);
                if(activeWorkflow.eventStream)
                    activeWorkflow.eventStream.write(`data: ${state}\n\n`);
            }).then(async (pdfResults) => {
                if(activeWorkflow.eventStream) {
                    activeWorkflow.eventStream.write("data: processing done\n\n");
                    activeWorkflow.eventStream.end();
                }
    
                activeWorkflow.result = pdfResults;
                activeWorkflow.finished = true;
                activeWorkflow.finishedAt = Date.now();
            }).catch((err) => {
                if(err.validationError) {
                    activeWorkflow.error = {type: 500, error: err};
                    activeWorkflow.finished = true;
                    activeWorkflow.finishedAt = Date.now();

                    // Bad Request
                    if(activeWorkflow.eventStream) {
                        activeWorkflow.eventStream.write(`data: ${activeWorkflow.error}\n\n`);
                        activeWorkflow.eventStream.end();
                    }
                }
                else if (err instanceof Error) {
                    console.error("Internal Server Error", err);
                    activeWorkflow.error = {type: 400, error: err.message, stack: err.stack};
                    activeWorkflow.finished = true;
                    activeWorkflow.finishedAt = Date.now();

                    // Internal Server Error
                    if(activeWorkflow.eventStream) {
                        activeWorkflow.eventStream.write(`data: ${activeWorkflow.error}\n\n`);
                        activeWorkflow.eventStream.end();
                    }
                } else {
                    throw err;
                }
            });
        }
    }
]);

router.get("/progress/:workflowUuid", (req: Request, res: Response) => {
    if(!req.params.workflowUuid) {
        res.status(400).json({"error": "No workflowUuid weres provided."});
        return;
    }
    if(!activeWorkflows.hasOwnProperty(req.params.workflowUuid)) {
        res.status(400).json({"error": `No workflow with workflowUuid "${req.params.workflowUuid}" was found.`});
        return;
    }

    // Return current progress
    const workflow = activeWorkflows[req.params.workflowUuid];
    res.status(200).json({ createdAt: workflow.createdAt, finished: workflow.finished, finishedAt: workflow.finishedAt, error: workflow.error });
});

router.get("/progress-stream/:workflowUuid", (req: Request, res: Response) => {
    if(!req.params.workflowUuid) {
        res.status(400).json({"error": "No workflowUuid weres provided."});
        return;
    }
    if(!activeWorkflows.hasOwnProperty(req.params.workflowUuid)) {
        res.status(400).json({"error": `No workflow with workflowUuid "${req.params.workflowUuid}" was found.`});
        return;
    }

    // TODO: Check if already done

    // Send realtime updates
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // flush the headers to establish SSE with client

    const workflow = activeWorkflows[req.params.workflowUuid];
    workflow.eventStream = res;

    res.on("close", () => {
        res.end();
        // TODO: Abort if not already done?
    });
});

router.get("/result/:workflowUuid", async (req: Request, res: Response) => {
    if(!req.params.workflowUuid) {
        res.status(400).json({"error": "No workflowUuid weres provided."});
        return;
    }
    if(!activeWorkflows.hasOwnProperty(req.params.workflowUuid)) {
        res.status(400).json({"error": `No workflow with workflowUuid "${req.params.workflowUuid}" was found.`});
        return;
    }

    /* 
     * If workflow isn't done return error
     * Send file, if there are multiple outputs return as zip
     * If download is done, delete results / allow deletion within the next 5-60 mins
    */
    const workflow = activeWorkflows[req.params.workflowUuid];
    if(!workflow.finished) {
        res.status(202).json({ message: "Workflow hasn't finished yet. Check progress or connect to progress-steam to get notified when its done." });
        return;
    }

    await respondWithPdfFiles(res, workflow.result, "workflow-results");
    // Delete workflow / results when done.
    delete activeWorkflows[req.params.workflowUuid];
});

router.post("/abort/:workflowUuid", (req: Request, res: Response) => {
    if(!req.params.workflowUuid) {
        res.status(400).json({"error": "No workflowUuid weres provided."});
        return;
    }
    if(!activeWorkflows.hasOwnProperty(req.params.workflowUuid)) {
        res.status(400).json({"error": `No workflow with workflowUuid "${req.params.workflowUuid}" was found.`});
        return;
    }

    // TODO: Abort workflow
    res.status(501).json({"warning": "Abortion has not been implemented yet."});
});

function generateWorkflowID() {
    return crypto.randomUUID();
}

export default router;