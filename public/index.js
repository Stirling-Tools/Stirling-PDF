import { scaleContent } from "./functions/scaleContent.js";
import { scalePage, PageSize } from "./functions/scalePage.js";
import * as exampleWorkflows from "./exampleWorkflows.js";
import { traverseOperations } from "./traverseOperations.js";
import * as Functions from "./functions.js";

(async (workflow) => {
    const pdfFileInput = document.getElementById('pdfFile');
    const doneButton = document.getElementById("doneButton");

    doneButton.addEventListener('click', async (e) => {
        console.log("Starting...");

        const files = Array.from(pdfFileInput.files);
        console.log(files);
        const inputs = await Promise.all(files.map(async file => {
            return {
                originalFileName: file.name.replace(/\.[^/.]+$/, ""),
                fileName: file.name.replace(/\.[^/.]+$/, ""),
                buffer: new Uint8Array(await file.arrayBuffer())
            }
        }));
        console.log(inputs);

        const traverse = traverseOperations(workflow.operations, inputs, Functions);

        let pdfResults;
        let iteration;
        while (true) {
            iteration = await traverse.next();
            if (iteration.done) {
                pdfResults = iteration.value;
                console.log(`data: processing done\n\n`);
                break;
            }
            console.log(`data: ${iteration.value}\n\n`);
        }
        
        pdfResults.forEach(result => {
            download(result.buffer, result.fileName, "application/pdf");
        });
    });
})(exampleWorkflows.imposeOnly);