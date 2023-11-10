import { organizeWaitOperations } from "./organizeWaitOperations.js";

import { extractPages } from "../functions/extractPages.js";
import { impose } from '../functions/impose.js';
import { mergePDFs } from '../functions/mergePDFs.js';
import { rotatePages } from '../functions/rotatePages.js';
import { scaleContent} from '../functions/scaleContent.js';
import { scalePage } from '../functions/scalePage.js';
import { splitPDF } from '../functions/splitPDF.js';
import { Metadata as dependantEditMetadata } from '../functions/editMetadata.js';
import { organizePages } from '../functions/organizePages.js';
import { removeBlankPages} from '../functions/removeBlankPages.js';
import { splitOn } from "../functions/splitOn.js";

/**
 * @typedef PDF
 * @property {string} originalFileName
 * @property {string} fileName
 * @property {Uint8Array} buffer
 */

/**
 * 
 * @param {JSON} operations 
 * @param {PDF|PDF[]} input 
 * @returns {}
 */
export async function * traverseOperations(operations, input) {
    const waitOperations = organizeWaitOperations(operations);
    /** @type {PDF[]} */ let results = [];
    yield* nextOperation(operations, input);
    return results;

    /**
     * 
     * @param {JSON} operations 
     * @param {PDF|PDF[]} input 
     * @returns {undefined}
     */
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
    
    /**
     * 
     * @param {JSON} operation
     * @param {PDF|PDF[]} input 
     * @returns {undefined}
     */
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
                    input.buffer = await extractPages(input.buffer, operation.values["pagesToExtractArray"]);
                });
                break;
            case "impose":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_imposed";
                    input.buffer = await impose(input.buffer, operation.values["nup"], operation.values["format"]);
                });
                break;
            case "merge":
                yield* nToOne(input, operation, async (inputs) => {
                    return {
                        originalFileName: inputs.map(input => input.originalFileName).join("_and_"),
                        fileName: inputs.map(input => input.fileName).join("_and_") + "_merged",
                        buffer: await mergePDFs(inputs.map(input => input.buffer))
                    }
                });
                break;
            case "rotate":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_turned";
                    input.buffer = await rotatePages(input.buffer, operation.values["rotation"]);
                });
                break;
            case "split":
                // TODO: A split might break the done condition, it may count multiple times. Needs further testing!
                yield* oneToN(input, operation, async (input) => {
                    const splitResult = await splitPDF(input.buffer, operation.values["pagesToSplitAfterArray"]);
    
                    const splits = [];
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
            case "editMetadata":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_metadataEdited";
                    input.buffer = await editMetadata(input.buffer, operation.values["metadata"]);
                });
                break;
            case "organizePages":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_pagesOrganized";
                    input.buffer = await organizePages(input.buffer, operation.values["operation"], operation.values["customOrderString"]);
                });
                break;
            case "removeBlankPages":
                yield* nToN(input, operation, async (input) => {
                    input.fileName += "_removedBlanks";
                    input.buffer = await removeBlankPages(input.buffer, operation.values["whiteThreashold"]);
                });
                break;
            case "splitOn":
                yield* oneToN(input, operation, async (input) => {
                    const splitResult = await splitOn(input.buffer, operation.values["type"], operation.values["whiteThreashold"]);
                    const splits = [];
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

    /**
     * 
     * @param {PDF|PDF[]} input 
     * @param {JSON} operation
     * @returns {undefined}
     */
    async function * nToOne(inputs, operation, callback) {
        inputs = Array.from(inputs); // Convert single values to array, keep arrays as is.
        
        inputs = await callback(inputs);
        yield* nextOperation(operation.operations, inputs);
    }

    /**
     * 
     * @param {PDF|PDF[]} input 
     * @param {JSON} operation
     * @returns {undefined}
     */
    async function * oneToN(input, operation, callback) {
        if(Array.isArray(input)) {
            let output = [];
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

    /**
     * 
     * @param {PDF|PDF[]} input 
     * @param {JSON} operation
     * @returns {undefined}
     */
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