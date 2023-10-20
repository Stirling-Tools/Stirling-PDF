import { extractPages } from "./functions/extractPages.js";
import { impose } from "./functions/impose.js";
import { mergePDFs } from "./functions/mergePDFs.js";
import { rotatePages } from "./functions/rotatePDF.js";
import { splitPDF } from "./functions/splitPDF.js";
import { organizeWaitOperations } from "./public/organizeWaitOperations.js";

export async function * traverseOperations(operations, input) {
    const waitOperations = organizeWaitOperations(operations);
    const results = [];
    for await (const value of nextOperation(operations, input)) {
        yield value;
    }
    return results;

    // TODO: Pult all nextOperation() in the for await, like for "extract"
    async function * nextOperation(operations, input) {
        if(Array.isArray(operations) && operations.length == 0) { // isEmpty
            console.log("operation done: " + input.fileName);
            results.push(input);
            return;
        }
    
        for (let i = 0; i < operations.length; i++) {
            for await (const value of computeOperation(operations[i], structuredClone(input))) {
                yield value;
            }
        }
    }
    
    async function * computeOperation(operation, input) {
        switch (operation.type) {
            case "done":
                console.log("Done operation will get called if all waits are done. Skipping for now.")
                break;
            case "wait":
                const waitOperation = waitOperations[operation.values.id];

                if(Array.isArray(input)) {
                    // waitOperation.input.concat(input); // May have unexpected concequences. Better throw an error for now.
                    throw new Error("Wait recieved an array as input. I don't know if this can happen, but if it does happen, I will investigate. Please share your workflow (:");
                }
                else {
                    waitOperation.input.push(input);
                }

                // Wait for all elements of previous split to finish
                if(input.splitCount && input.splitCount > 0) {
                    input.splitCount--;
                    return;
                }

                waitOperation.waitCount--;
                if(waitOperation.waitCount == 0) {
                    await nextOperation(waitOperation.doneOperation.operations, waitOperation.input);
                }
                break;
            case "removeObjects":
                console.warn("RemoveObjects not implemented yet.")

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
                        input[i].fileName += "_extractedPages";
                        input[i].buffer = await extractPages(input[i].buffer, operation.values["pagesToExtractArray"]);
                        for await (const value of nextOperation(operation.operations, input[i])) {
                            yield value;
                        }
                    }
                }
                else {
                    input.fileName += "_extractedPages";
                    input.buffer = await extractPages(input.buffer, operation.values["pagesToExtractArray"]);
                    for await (const value of nextOperation(operation.operations, input)) {
                        yield value;
                    }
                }
                break;
            case "split":
                if(Array.isArray(input)) {
                    for (let i = 0; i < input.length; i++) {
                        const splits = await splitPDF(input[i].buffer, operation.values["pagesToSplitAfterArray"]);

                        for (let j = 0; j < splits.length; j++) {
                            const split = {};
                            split.originalFileName = input[i].originalFileName;
                            split.fileName = input[i].fileName + "_split" + j;
                            split.buffer = splits[j];
                            split.splitCount = splits.length * input.length;
                            // TODO: When a split goes into another split function and then into a wait function it might break the done condition, as it will count multiplpe times.
                            for await (const value of nextOperation(operation.operations, split)) {
                                yield value;
                            }
                        }
                    }
                }
                else {
                    const splits = await splitPDF(input.buffer, operation.values["pagesToSplitAfterArray"]);

                    for (let j = 0; j < splits.length; j++) {
                        const split = {};
                        split.originalFileName = input.originalFileName;
                        split.fileName = input.fileName + "_split" + j;
                        split.buffer = splits[j];
                        split.splitCount = splits.length;
                        for await (const value of nextOperation(operation.operations, split)) {
                            yield value;
                        }
                    }
                }
                break;
            case "fillField":
                console.warn("FillField not implemented yet.")

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
                console.warn("ExtractImages not implemented yet.")

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
                console.warn("Transform not implemented yet.")
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
            case "extract":
                if(Array.isArray(input)) {
                    for (let i = 0; i < input.length; i++) {
                        input[i].fileName += "_extractedPages";
                        input[i].buffer = await extractPages(input[i].buffer, operation.values["pagesToExtractArray"]);
                        await nextOperation(operation.operations, input[i]);
                    }
                }
                else {
                    input.fileName += "_extractedPages";
                    input.buffer = await extractPages(input.buffer, operation.values["pagesToExtractArray"]);
                    await nextOperation(operation.operations, input);
                }
                break;
            case "rotate":
                if(Array.isArray(input)) {
                    for (let i = 0; i < input.length; i++) {
                        input[i].fileName += "_turned";
                        input[i].buffer = await rotatePages(input[i].buffer, operation.values["rotation"]);
                        await nextOperation(operation.operations, input[i]);
                    }
                }
                else {
                    input.fileName += "_turned";
                    input.buffer = await rotatePages(input.buffer, operation.values["rotation"]);
                    await nextOperation(operation.operations, input);
                }
                break;
            case "impose":
                if(Array.isArray(input)) {
                    for (let i = 0; i < input.length; i++) {
                        input[i].fileName += "_imposed";
                        input[i].buffer = await impose(input[i].buffer, operation.values["nup"], operation.values["format"]);
                        await nextOperation(operation.operations, input[i]);
                    }
                }
                else {
                    input.fileName += "_imposed";
                    input.buffer = await impose(input.buffer, operation.values["nup"], operation.values["format"]);
                    await nextOperation(operation.operations, input);
                }
                break;
            default:
                console.log("operation type unknown: ", operation.type);
                break;
        }
        yield operation.type;
    }
}