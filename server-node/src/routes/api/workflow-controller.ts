import express, { Request, Response } from 'express';
import crypto from 'crypto';
import stream from "stream";
import Archiver from 'archiver';
import multer from 'multer'
const upload = multer();

import Operations from "../../utils/pdf-operations";
import { traverseOperations } from "@stirling-pdf/shared-operations/src/workflow/traverseOperations";

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

        const inputs = await Promise.all((req.files as Express.Multer.File[]).map(async file => {
            console.log(file);
            return {
                originalFileName: file.originalname.replace(/\.[^/.]+$/, ""),
                fileName: file.originalname.replace(/\.[^/.]+$/, ""),
                buffer: new Uint8Array(await file.buffer)
            }
        }));

        // // Allow option to do it synchronously and just make a long request
        // if(req.body.async === "false") {
        //     console.log("Don't do async");

        //     const traverse = traverseOperations(workflow.operations, inputs, Operations);

        //     let pdfResults;
        //     let iteration;
        //     while (true) {
        //         iteration = await traverse.next();
        //         if (iteration.done) {
        //             pdfResults = iteration.value;
        //             console.log("Done");
        //             break;
        //         }
        //         console.log(iteration.value);
        //     }

        //     console.log("Download");
        //     downloadHandler(res, pdfResults);
        // }
        // else {
        //     console.log("Start Aync Workflow");
        //     // TODO: UUID collision checks
        //     let workflowID = req.params.workflowUuid
        //     if(!workflowID)
        //         workflowID = generateWorkflowID();

        //     activeWorkflows[workflowID] = {
        //         createdAt: Date.now(),
        //         finished: false, 
        //         eventStream: null,
        //         result: null,
        //         // TODO: When auth is implemented: owner
        //     }
        //     const activeWorkflow = activeWorkflows[workflowID];

        //     res.status(200).json({
        //         "workflowID": workflowID,
        //         "data-recieved": {
        //             "fileCount": filesArr.length,
        //             "workflow": workflow
        //         }
        //     });

        //     const traverse = traverseOperations(workflow.operations, inputs, Operations);

        //     let pdfResults;
        //     let iteration;
        //     while (true) {
        //         iteration = await traverse.next();
        //         if (iteration.done) {
        //             pdfResults = iteration.value;
        //             if(activeWorkflow.eventStream) {
        //                 activeWorkflow.eventStream.write(`data: processing done\n\n`);
        //                 activeWorkflow.eventStream.end();
        //             }
        //             break;
        //         }
        //         if(activeWorkflow.eventStream)
        //             activeWorkflow.eventStream.write(`data: ${iteration.value}\n\n`);
        //     }

        //     activeWorkflow.result = pdfResults;
        //     activeWorkflow.finished = true;
        // }
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

router.get("/result/:workflowUuid", (req: Request, res: Response) => {
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

    downloadHandler(res, workflow.result);
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

function downloadHandler(res: Response, pdfResults: any) {
    if(pdfResults.length == 0) {
        res.status(500).json({"warning": "The workflow had no outputs."});
    } 
    else if(pdfResults.length > 1) {
        // TODO: Also allow the user to download multiple files without zip compressen, because this is kind of slow...
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-disposition': 'attachment; filename=workflow-results.zip'
        });

        var zip = Archiver('zip');

        // Stream the file to the user.
        zip.pipe(res);

        console.log("Adding Files to ZIP...");

        for (let i = 0; i < pdfResults.length; i++) {
            // TODO: Implement other file types (mostly fro image & text extraction)
            // TODO: Check for name collisions
            zip.append(Buffer.from(pdfResults[i].buffer), { name: pdfResults[i].fileName + ".pdf" });   
        }

        zip.finalize();
        console.log("Sent");
    }
    else {
        const readStream = new stream.PassThrough();
        readStream.end(pdfResults[0].buffer);

        // TODO: Implement other file types (mostly fro image & text extraction)
        res.set("Content-disposition", 'attachment; filename=' + pdfResults[0].fileName + ".pdf");
        res.set("Content-Type", "application/pdf");

        readStream.pipe(res);
    }
}

export default router;