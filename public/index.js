import { scaleContent } from "./functions/scaleContent.js";
import { scalePage, PageSize } from "./functions/scalePage.js";
import { testWorkflow } from "./testWorkflow.js";
import { traverseOperations } from "./traverseOperations.js";

(async (workflow) => {
    const pdfFileInput = document.getElementById('pdfFile');
    const doneButton = document.getElementById("doneButton");

    doneButton.addEventListener('click', async (e) => {
        const files = Array.from(pdfFileInput.files);
        console.log(files);
        const pdfBuffers = await Promise.all(files.map(async file => {
            return {
                originalFileName: file.name.replace(/\.[^/.]+$/, ""),
                fileName: file.name.replace(/\.[^/.]+$/, ""),
                buffer: new Uint8Array(await file.arrayBuffer())
            }
        }));
        console.log(pdfBuffers);

        await traverseOperations(workflow.operations, pdfBuffers);

        // if(selectedElementsList[0].textContent == "mergePDFs") {

        // }

        // // TODO: This can also be run serverside
        // if(files.length > 1) {
        //     files.forEach(file => {
                
        //     });
        // }
        // else {
        //     const file = files[0];
        //     let pdfBuffer = new Uint8Array(await file.arrayBuffer());
        //     if (file) {
        //         for (let i = 0; i < selectedElementsList.length; i++) {
        //           const selectedOption = selectedElementsList[i];
              
        //           // Perform actions based on the selected option using the switch statement
        //           switch (selectedOption.textContent) {
        //             case "scaleContent":
        //                 pdfBuffer = await scaleContent(pdfBuffer, 2);
        //                 break;
        //             case "changePageSize":
        //                 pdfBuffer = await scalePage(pdfBuffer, PageSize.letter);
        //                 break;
        //             default:
        //                 // Handle any other actions or errors here
        //                 throw new Error(`This action ${selectedOption.value} has not been implemented.`);
        //             }
        //         }
        //         download(pdfBuffer, file.name.replace(/\.[^/.]+$/, "") + "_mod.pdf", "application/pdf");
        //     }
        // }
    });
})(testWorkflow);
