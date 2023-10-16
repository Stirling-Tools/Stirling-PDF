import { scaleContent } from "./functions/scaleContent.js";
import { scalePage, PageSize } from "./functions/scalePage.js";
import { organizeWaitOperations } from "./organizeWaitOperations.js";
import { testWorkflow } from "./testWorkflow.js";

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

        const waitOperations = organizeWaitOperations(workflow.operations);

        nextOperation(workflow.operations, pdfBuffers);

        async function nextOperation(operations, input) {
            if(Array.isArray(operations) && operations.length == 0) { // isEmpty
                console.log("operation done: " + input.fileName);
                //TODO: Download Restult
                return;
            }

            for (let i = 0; i < operations.length; i++) {
                console.warn(input);
                await computeOperation(operations[i], structuredClone(input)); // break references
            }
        }

        async function computeOperation(operation, input) {
            switch (operation.type) {
                case "done":
                    console.log("Done operation will get called if all waits are done. Skipping for now.")
                    break;
                case "wait":
                    const waitOperation = waitOperations[operation.values.id];
                    waitOperation.input.push(input);
                    waitOperation.waitCount--;
                    if(waitOperation.waitCount == 0) {
                        await nextOperation(waitOperation.doneOperation.operations, waitOperation.input);
                    }
                    break;
                case "removeObjects":
                    if(Array.isArray(input)) {
                        for (let i = 0; i < input.length; i++) {
                            // TODO: modfiy input
                            input[i].fileName += "_removedObjects";
                            await nextOperation(operation.operations, input[i]);
                        }
                    }
                    else {
                        // TODO: modfiy input
                        input.fileName += "_removedObjects";
                        await nextOperation(operation.operations, input);
                    }
                    break;
                case "extract":
                    if(Array.isArray(input)) {
                        for (let i = 0; i < input.length; i++) {
                            // TODO: modfiy input
                            input[i].fileName += "_extractedPages";
                            await nextOperation(operation.operations, input[i]);
                        }
                    }
                    else {
                        // TODO: modfiy input
                        input.fileName += "_extractedPages";
                        await nextOperation(operation.operations, input);
                    }
                    break;
                case "fillField":
                    if(Array.isArray(input)) {
                        for (let i = 0; i < input.length; i++) {
                            // TODO: modfiy input
                            input[i].fileName += "_filledField";
                            await nextOperation(operation.operations, input[i]);
                        }
                    }
                    else {
                        // TODO: modfiy input
                        input.fileName += "_filledField";
                        await nextOperation(operation.operations, input);
                    }
                    break;
                case "extractImages":
                    if(Array.isArray(input)) {
                        for (let i = 0; i < input.length; i++) {
                            // TODO: modfiy input
                            input[i].fileName += "_extractedImages";
                            await nextOperation(operation.operations, input[i]);
                        }
                    }
                    else {
                        // TODO: modfiy input
                        input.fileName += "_extractedImages";
                        await nextOperation(operation.operations, input);
                    }
                    break;
                case "merge":
                    if(Array.isArray(input)) {
                        input = {
                            originalFileName: input.map(input => input.originalFileName).join("_and_"),
                            fileName: input.map(input => input.fileName).join("_and_") + "_merged",
                            buffer: input[0].buffer // TODO: merge inputs
                        }
                    }
                    else {
                        // TODO: modfiy input
                        input.fileName += "_merged";
                    }
                    await nextOperation(operation.operations, input);
                    break;
                case "transform": {
                    if(Array.isArray(input)) {
                        for (let i = 0; i < input.length; i++) {
                            // TODO: modfiy input
                            input[i].fileName += "_transformed";
                            await nextOperation(operation.operations, input[i]);
                        }
                    }
                    else {
                        // TODO: modfiy input
                        input.fileName += "_transformed";
                        await nextOperation(operation.operations, input);
                    }
                    break;
                }
                default:
                    console.log("operation type unknown: ", operation.type);
                    break;
            }
        }





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

    // document.getElementById("addButton").addEventListener("click", function() {
    //     const selectedOption = document.getElementById("pdfOptions").value;
    //     const operations = document.getElementById("operations");
      
    //     if (selectedOption) {
    //         const listItem = document.createElement("li");
    //         listItem.textContent = selectedOption;
    //         operations.appendChild(listItem);
    //     }
    // });
})(testWorkflow);
