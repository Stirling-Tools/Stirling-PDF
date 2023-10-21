import { extractPages } from "./functions/extractPages.js";
import { impose } from "./functions/impose.js";
import { mergePDFs } from "./functions/mergePDFs.js";
import { rotatePages } from "./functions/rotatePDF.js";
import { splitPDF } from "./functions/splitPDF.js";
import { organizeWaitOperations } from "./public/organizeWaitOperations.js";

export async function * traverseOperations(operations, input) {
    const waitOperations = organizeWaitOperations(operations);
    let results = [];
    yield* nextOperation(operations, input)
    return results;

    async function * nextOperation(operations, input) {
        console.log(Array.isArray(operations) && operations.length == 0);
        if(Array.isArray(operations) && operations.length == 0) { // isEmpty
            if(Array.isArray(input)) {
                console.log("operation done: " + input[0].fileName + "+");
                results = results.concat(input);
                return;
            }
            else {
                console.log("operation done: " + input.fileName);
                results.push(input);
                return;
            }
        }
    
        for (let i = 0; i < operations.length; i++) {
            yield* computeOperation(operations[i], structuredClone(input));
        }
    }
    
    async function * computeOperation(operation, input) {
        yield "Starting: " + operation.type;
        switch (operation.type) {
            case "wait":
                const waitOperation = waitOperations[operation.values.id];

                if(Array.isArray(input)) {
                    waitOperation.input.concat(input); // TODO: May have unexpected concequences. Needs further testing!
                }
                else {
                    waitOperation.input.push(input);
                }

                waitOperation.waitCount--;
                if(waitOperation.waitCount == 0) {
                    yield* nextOperation(waitOperation.doneOperation.operations, waitOperation.input);
                }
                break;
            case "extract":
                yield * nToN(input, operation, async (input) => {
                    input.fileName += "_extractedPages";
                    input.buffer = await extractPages(input.buffer, operation.values["pagesToExtractArray"]);
                });

                break;
            case "split":
                // TODO: A split might break the done condition, it may count multiple times. Needs further testing!

                yield * oneToN(input, operation, async (input) => {
                    const splitResult = await splitPDF(input.buffer, operation.values["pagesToSplitAfterArray"]);

                    const splits = [];
                    for (let j = 0; j < splitResult.length; j++) {
                        splits.push({
                            originalFileName: input.originalFileName,
                            fileName: input.fileName + "_split" + j,
                            buffer: splitResult[j]
                        })
                    }

                    input = splits;
                });
                break;
            case "merge":
                yield * nToOne(input, operation, async (input) => {
                    const inputs = input;
                    input = {
                        originalFileName: inputs.map(input => input.originalFileName).join("_and_"),
                        fileName: inputs.map(input => input.fileName).join("_and_") + "_merged",
                        buffer: await mergePDFs(inputs.map(input => input.buffer))
                    }
                });
                break;
            case "rotate":
                yield * nToN(input, operation, async (input) => {
                    input.fileName += "_turned";
                    input.buffer = await rotatePages(input.buffer, operation.values["rotation"]);
                });
                break;
            case "impose":
                yield * nToN(input, operation, async (input) => {
                    input.fileName += "_imposed";
                    input.buffer = await impose(input.buffer, operation.values["nup"], operation.values["format"]);
                });
                break;
            default:
                throw new Error(`${operation.type} not implemented yet.`);
                break;
        }
    }

    async function * nToOne(input, operation, callback) {
        if(!Array.isArray(input)) {
            input = [input];
        }
        
        await callback(input);
        yield* nextOperation(operation.operations, input);
    }

    async function * oneToN(input, operation, callback) {
        if(Array.isArray(input)) {
            for (let i = 0; i < input.length; i++) {
                await callback(input[i]);
            }
            yield* nextOperation(operation.operations, input);
        }
        else {
            await callback(input);
            yield* nextOperation(operation.operations, input);
        }
    }

    async function * nToN(input, operation, callback) {
        if(Array.isArray(input)) {
            for (let i = 0; i < input.length; i++) {
                await callback(input[i]);
            }
            yield* nextOperation(operation.operations, input);
        }
        else {
            await callback(input);
            yield* nextOperation(operation.operations, input);
        }
    }
}