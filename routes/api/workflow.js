import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import stream from "stream";

import { traverseOperations } from "../../traverseOperations.js";

const activeWorkflows = {};

const router = express.Router();

router.post("/", [
    multer().array("files"),
    async (req, res, next) => {
        const workflow = JSON.parse(req.body.workflow);
        console.log("fileCount: ", req.files.length);
        console.log("workflow: ", workflow);

        // TODO: Validate

        let workflowID = undefined;

        const inputs = await Promise.all(req.files.map(async file => {
            console.log(file);
            return {
                originalFileName: file.originalname.replace(/\.[^/.]+$/, ""),
                fileName: file.originalname.replace(/\.[^/.]+$/, ""),
                buffer: new Uint8Array(await file.buffer)
            }
        }));

        // Allow option to do it synchronously and just make a long request
        if(req.body.async === "false") {
            console.log("Don't do async");

            const pdfResults = await traverseOperations(workflow.operations, inputs);
            downloadHandler(res, pdfResults);
        }
        else {
            workflowID = generateWorkflowID();
            activeWorkflows[workflowID] = {
                createdAt: Date.now(),
                finished: false, 
                eventStream: null,
                result: null,
                // TODO: When auth is implemented: owner
            }

            res.status(501).json({
                "warning": "Unfinished Endpoint",
                "workflowID": workflowID,
                "data-recieved": {
                    "fileCount": req.files.length,
                    "workflow": workflow
                }
            });

            traverseOperations(workflow.operations, inputs).then((pdfResults) => {
                activeWorkflows[workflowID].result = pdfResults;
                activeWorkflows[workflowID].finished = true;
                // TODO: Post to eventStream
            });
        }
    }
]);

router.get("/progress/:workflowUuid", (req, res, nex) => {
    // TODO: Validation

    // Return current progress
    const workflow = activeWorkflows[req.params.workflowUuid];
    res.status(200).json({ createdAt: workflow.createdAt, finished: workflow.finished });
});

router.get("/progress-stream/:workflowUuid", (req, res, nex) => {
    // TODO: Send realtime updates
    res.status(501).json({"warning": "Event-Stream has not been implemented yet."});
});

router.get("/result/:workflowUuid", (req, res, nex) => {
    // TODO: Validation

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

router.post("/abort/:workflowUuid", (req, res, nex) => {
    // TODO: Abort workflow
    res.status(501).json({"warning": "Abortion has not been implemented yet."});
});

function generateWorkflowID() {
    return crypto.randomUUID();
}

function downloadHandler(res, pdfResults) {
    if(pdfResults.length > 1) {
        res.status(501).json({"warning": "The workflow had multiple outputs, this is not implemented yet."});
        // TODO: Implement ZIP
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