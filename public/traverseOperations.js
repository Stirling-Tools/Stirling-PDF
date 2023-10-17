import { mergePDFs } from "./functions/mergePDFs.js";
import { organizeWaitOperations } from "./organizeWaitOperations.js";

export async function traverseOperations(operations, input) {
    const waitOperations = organizeWaitOperations(operations);
    const results = [];
    await nextOperation(operations, input);
    return results;

    async function nextOperation(operations, input) {
        if(Array.isArray(operations) && operations.length == 0) { // isEmpty
            console.log("operation done: " + input.fileName);
            results.push(input);
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
                if(Array.isArray(input) && input.length > 1) {
                    const inputs = input;
                    input = {
                        originalFileName: inputs.map(input => input.originalFileName).join("_and_"),
                        fileName: inputs.map(input => input.fileName).join("_and_") + "_merged",
                        buffer: await mergePDFs(inputs.map(input => input.buffer))
                    }
                }
                else {
                    // Only one input, no need to merge
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
}