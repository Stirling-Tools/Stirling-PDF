import express, { Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer'
const upload = multer();

import { traverseOperations } from "@stirling-pdf/shared-operations/src/workflow/traverseOperations";
import { PdfFile, RepresentationType } from '@stirling-pdf/shared-operations/src/wrappers/PdfFile';
import { respondWithPdfFiles } from '../../utils/endpoint-utils';

const activeWorkflows: any = {};

const router = express.Router();

router.post("/:workflowUuid?", [
    upload.array("files"),
    async (req: Request, res: Response) => {
        // TODO: Maybe replace with another validator
        if(req.files?.length == 0) {
            res.status(400).json({"error": "No files were uploaded."});
            return;
        }
 
        // TODO: Validate input further (json may be invalid or not be in workflow format)
        const workflow = JSON.parse(req.body.workflow);

        // TODO: Replace with static multer function of pdffile
        const inputs = await Promise.all((req.files as Express.Multer.File[]).map(async file => {
            return new PdfFile(file.originalname.replace(/\.[^/.]+$/, ""), new Uint8Array(await file.buffer), RepresentationType.Uint8Array, file.originalname.replace(/\.[^/.]+$/, ""));
        }));

        // Allow option to do it synchronously and just make a long request
        if(req.body.async === "false") {
            console.log("Don't do async");

            const traverse = traverseOperations(workflow.operations, inputs);

            let pdfResults;
            let iteration;
            while (true) {
                iteration = await traverse.next();
                if (iteration.done) {
                    pdfResults = iteration.value;
                    console.log("Done");
                    break;
                }
                console.log(iteration.value);
            }

            console.log("Download");
            await respondWithPdfFiles(res, pdfResults, "workflow-results");
        }
        else {
            console.log("Start Aync Workflow");
            // TODO: UUID collision checks
            let workflowID = req.params.workflowUuid
            if(!workflowID)
                workflowID = generateWorkflowID();

            activeWorkflows[workflowID] = {
                createdAt: Date.now(),
                finished: false, 
                eventStream: null,
                result: null,
                // TODO: When auth is implemented: owner
            }
            const activeWorkflow = activeWorkflows[workflowID];

            res.status(200).json({
                "workflowID": workflowID,
                "data-recieved": {
                    "fileCount": inputs.length,
                    "workflow": workflow
                }
            });

            const traverse = traverseOperations(workflow.operations, inputs);

            let pdfResults;
            let iteration;
            while (true) {
                iteration = await traverse.next();
                if (iteration.done) {
                    pdfResults = iteration.value;
                    if(activeWorkflow.eventStream) {
                        activeWorkflow.eventStream.write(`data: processing done\n\n`);
                        activeWorkflow.eventStream.end();
                    }
                    break;
                }
                if(activeWorkflow.eventStream)
                    activeWorkflow.eventStream.write(`data: ${iteration.value}\n\n`);
            }

            activeWorkflow.result = pdfResults;
            activeWorkflow.finished = true;
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
    res.status(200).json({ createdAt: workflow.createdAt, finished: workflow.finished });
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
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    const workflow = activeWorkflows[req.params.workflowUuid];
    workflow.eventStream = res;

    res.on('close', () => {
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
     * Send file, TODO: if there are multiple outputs return as zip
     * If download is done, delete results / allow deletion within the next 5-60 mins
    */
    const workflow = activeWorkflows[req.params.workflowUuid];
    if(!workflow.finished) {
        res.status(202).json({ message: "Workflow hasn't finished yet. Check progress or connect to progress-steam to get notified when its done." });
        return
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