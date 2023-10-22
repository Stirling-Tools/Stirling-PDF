import { organizeWaitOperations } from "./organizeWaitOperations.js";

/**
 * 
 * @param {*} operations 
 * @param {*} input 
 * @param {import('./functions.js')} Functions 
 * @returns 
 */
export async function * traverseOperations(operations, input, Functions) {
    const waitOperations = organizeWaitOperations(operations);
    let results = [];
    yield* nextOperation(operations, input);
    console.log("Done2");
    return results;

    async function * nextOperation(operations, input) {
        if(Array.isArray(operations) && operations.length == 0) { // isEmpty
            if(Array.isArray(input)) {
                console.log("operation done: " + input[0].fileName + input.length > 1 ? "+" : "");
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
            case "done": // Skip this, because it is a valid node.
                break;
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
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_extractedPages";
                    input.buffer = await Functions.extractPages(input.buffer, operation.values["pagesToExtractArray"]);
                });
                break;
            case "impose":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_imposed";
                    input.buffer = await Functions.impose(input.buffer, operation.values["nup"], operation.values["format"]);
                });
                break;
            case "merge":
                yield* nToOne(input, operation, async (inputs) => {
                    return {
                        originalFileName: inputs.map(input => input.originalFileName).join("_and_"),
                        fileName: inputs.map(input => input.fileName).join("_and_") + "_merged",
                        buffer: await Functions.mergePDFs(inputs.map(input => input.buffer))
                    }
                });
                break;
            case "rotate":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_turned";
                    input.buffer = await Functions.rotatePages(input.buffer, operation.values["rotation"]);
                });
                break;
            case "split":
                // TODO: A split might break the done condition, it may count multiple times. Needs further testing!
                yield* oneToN(input, operation, async (input) => {
                    const splitResult = await Functions.splitPDF(input.buffer, operation.values["pagesToSplitAfterArray"]);
    
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
            case "editMetadata":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_metadataEdited";
                    input.buffer = await Functions.editMetadata(input.buffer, operation.values["metadata"]);
                });
                break;
            default:
                throw new Error(`${operation.type} not implemented yet.`);
                break;
        }
    }

    async function * nToOne(inputs, operation, callback) {
        if(!Array.isArray(inputs)) {
            inputs = [inputs];
        }
        
        inputs = await callback(inputs);
        yield* nextOperation(operation.operations, inputs);
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