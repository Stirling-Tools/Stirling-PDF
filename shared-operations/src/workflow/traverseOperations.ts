import { organizeWaitOperations } from "./organizeWaitOperations.js";
import { Operation, WaitOperation } from "../../declarations/Operation.js";
import { PDF } from "../../declarations/PDF.js";

export async function * traverseOperations(operations: Operation[], input: PDF[] | PDF, Operations: AllOperations): AsyncGenerator<string, PDF[], void> {
    const waitOperations = organizeWaitOperations(operations);
    let results: PDF[] = [];
    yield* nextOperation(operations, input);
    return results;

    async function * nextOperation(operations: Operation[] | undefined, input: PDF[] | PDF): AsyncGenerator<string, void, void> {
        if(operations === undefined || (Array.isArray(operations) && operations.length == 0)) { // isEmpty
            if(Array.isArray(input)) {
                console.log("operation done: " + input[0].fileName + (input.length > 1 ? "+" : ""));
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
    
    async function * computeOperation(operation: Operation, input: PDF|PDF[]): AsyncGenerator<string, void, void> {
        yield "Starting: " + operation.type;
        switch (operation.type) {
            case "done": // Skip this, because it is a valid node.
                break;
            case "wait":
                const waitOperation = waitOperations[(operation as WaitOperation).values.id];

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
                    input.buffer = await Operations.extractPages(input.buffer, operation.values["pagesToExtractArray"]);
                });
                break;
            case "impose":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_imposed";
                    input.buffer = await Operations.impose(input.buffer, operation.values["nup"], operation.values["format"]);
                });
                break;
            case "merge":
                yield* nToOne(input, operation, async (inputs) => {
                    return {
                        originalFileName: inputs.map(input => input.originalFileName).join("_and_"),
                        fileName: inputs.map(input => input.fileName).join("_and_") + "_merged",
                        buffer: await Operations.mergePDFs(inputs.map(input => input.buffer))
                    }
                });
                break;
            case "rotate":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_turned";
                    input.buffer = await Operations.rotatePages(input.buffer, operation.values["rotation"]);
                });
                break;
            case "split":
                // TODO: A split might break the done condition, it may count multiple times. Needs further testing!
                yield* oneToN(input, operation, async (input) => {
                    const splitResult = await Operations.splitPDF(input.buffer, operation.values["pagesToSplitAfterArray"]);
    
                    const splits: PDF[] = [];
                    for (let j = 0; j < splitResult.length; j++) {
                        splits.push({
                            originalFileName: input.originalFileName,
                            fileName: input.fileName + "_split" + j,
                            buffer: splitResult[j]
                        })
                    }
                    return splits;
                });
                break;
            case "updateMetadata":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_metadataEdited";
                    input.buffer = await Operations.updateMetadata(input.buffer, operation.values["metadata"]);
                });
                break;
            case "organizePages":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_pagesOrganized";
                    input.buffer = await Operations.organizePages(input.buffer, operation.values["operation"], operation.values["customOrderString"]);
                });
                break;
            case "removeBlankPages":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_removedBlanks";
                    input.buffer = await Operations.removeBlankPages(input.buffer, operation.values["whiteThreashold"]);
                });
                break;
            case "splitOn":
                yield* oneToN(input, operation, async (input) => {
                    const splitResult = await Operations.splitOn(input.buffer, operation.values["type"], operation.values["whiteThreashold"]);
                    const splits: PDF[] = [];
                    for (let j = 0; j < splitResult.length; j++) {
                        splits.push({
                            originalFileName: input.originalFileName,
                            fileName: input.fileName + "_split" + j,
                            buffer: splitResult[j]
                        })
                    }
    
                    return splits;
                });
                break;
            default:
                throw new Error(`${operation.type} not implemented yet.`);
                break;
        }
    }

    async function * nToOne(inputs: PDF|PDF[], operation: Operation, callback: (pdf: PDF[]) => Promise<PDF>): AsyncGenerator<string, void, void> {
        let output: PDF = await callback(Array.isArray(inputs) ? inputs : Array.of(inputs));
        
        yield* nextOperation(operation.operations, output);
    }

    async function * oneToN(input: PDF|PDF[], operation: Operation, callback: (pdf: PDF) => Promise<PDF[]>): AsyncGenerator<string, void, void> {
        if(Array.isArray(input)) {
            let output: PDF[] = [];
            for (let i = 0; i < input.length; i++) {
                output = output.concat(await callback(input[i]));
            }
            yield* nextOperation(operation.operations, output);
        }
        else {
            input = await callback(input);
            yield* nextOperation(operation.operations, input);
        }
    }

    async function * nToN(input: PDF|PDF[], operation: Operation, callback: (pdf: PDF) => void): AsyncGenerator<string, void, void> {
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