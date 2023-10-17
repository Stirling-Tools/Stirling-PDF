import { scaleContent } from "./functions/scaleContent.js";
import { scalePage, PageSize } from "./functions/scalePage.js";
import * as exampleWorkflows from "./exampleWorkflows.js";
import { traverseOperations } from "./traverseOperations.js";

(async (workflow) => {
    const pdfFileInput = document.getElementById('pdfFile');
    const doneButton = document.getElementById("doneButton");

    doneButton.addEventListener('click', async (e) => {
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

        // TODO: This can also be run serverside
        const results = await traverseOperations(workflow.operations, inputs);
        
        results.forEach(result => {
            download(result.buffer, result.fileName, "application/pdf");
        });
    });
})(exampleWorkflows.imposeOnly);