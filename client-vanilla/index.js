import { scaleContent } from "./functions/scaleContent.js";
import { scalePage, PageSize } from "./functions/scalePage.js";
import * as exampleWorkflows from "./exampleWorkflows.js";
import { traverseOperations } from "./traverseOperations.js";
import * as Functions from "./functions.js";

(async () => {
    const workflowField = document.getElementById("workflow");

    const dropdown = document.getElementById("pdfOptions");
    // Clear existing options (if any)
    dropdown.innerHTML = '';

    console.log(exampleWorkflows);
    // Iterate over the keys of the object and create an option for each key
    for (const key in exampleWorkflows) {
        const option = document.createElement('option');
        option.value = key;
        option.text = key;
        dropdown.appendChild(option);
    }
    
    const loadButton = document.getElementById("loadButton");
    loadButton.addEventListener("click", (e) => {
        workflowField.value = JSON.stringify(exampleWorkflows[dropdown.value], null, 2);
    });
    loadButton.click();

    const pdfFileInput = document.getElementById('pdfFile');
    const doneButton = document.getElementById("doneButton");

    doneButton.addEventListener('click', async (e) => {
        console.log("Starting...");

        const files = Array.from(pdfFileInput.files);
        const inputs = await Promise.all(files.map(async file => {
            return {
                originalFileName: file.name.replace(/\.[^/.]+$/, ""),
                fileName: file.name.replace(/\.[^/.]+$/, ""),
                buffer: new Uint8Array(await file.arrayBuffer())
            }
        }));
        console.log(inputs);

        const workflow = JSON.parse(workflowField.value);
        console.log(workflow);
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
        
        // TODO: Zip if wanted
        pdfResults.forEach(result => {
            download(result.buffer, result.fileName, "application/pdf");
        });
    });
})();