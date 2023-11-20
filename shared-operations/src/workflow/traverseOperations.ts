import { organizeWaitOperations } from "./organizeWaitOperations";
import { Action, WaitAction } from "../../declarations/Action";
import { PdfFile } from "../wrappers/PdfFile";
import { Progress } from "../functions";
import { validateOperations } from "./validateOperations";
import { getOperatorByName } from "./getOperatorByName";

export async function traverseOperations(operations: Action[], input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
    const validationResult = validateOperations(operations);
    if(!validationResult.valid) {
        return Promise.reject({validationError: validationResult.reason});
    }
    
    const waitOperations = organizeWaitOperations(operations);

    let results: PdfFile[] = [];
    await nextOperation(operations, input, progressCallback);
    return results;

    async function nextOperation(actions: Action[] | undefined, input: PdfFile[], progressCallback: (state: Progress) => void): Promise<void> {
        console.log("Next Operation");
        if(actions === undefined || (Array.isArray(actions) && actions.length == 0)) { // isEmpty
            console.log("Last Operation");
            if(Array.isArray(input)) {
                console.log("ArrayOut: ", input);
                console.log("operation done: " + input[0].filename + (input.length > 1 ? "+" : ""));
                results = results.concat(input);
                return;
            }
        }
    
        for (let i = 0; i < actions.length; i++) {
            await computeOperation(actions[i], Object.assign([], input), progressCallback); // structuredClone-like for ts TODO: test if this really works
        }
    }
    
    async function computeOperation(action: Action, input: PdfFile[], progressCallback: (state: Progress) => void): Promise<void> {
        console.log("Input: ", input);
        switch (action.type) {
            case "done": // Skip this, because it is a valid node.
                break;
            case "wait":
                const waitOperation = waitOperations[(action as WaitAction).values.id];

                if(Array.isArray(input)) {
                    waitOperation.input.concat(input); // TODO: May have unexpected concequences. Needs further testing!
                }
                else {
                    waitOperation.input.push(input);
                }

                waitOperation.waitCount--;
                if(waitOperation.waitCount == 0 && waitOperation.doneOperation.actions) {
                    await nextOperation(waitOperation.doneOperation.actions, waitOperation.input, progressCallback);
                }
                break;
            /*case "extract":
                yield* nToN(input, action, async (input) => {
                    const newPdf = await Operations.extractPages({file: input, pageIndexes: action.values["pageIndexes"]});
                    return newPdf;
                });
                break;
            case "impose":
                let impose = new Impose(action);
                input = await impose.run(input, progressCallback);
                await nextOperation(action.actions, input, progressCallback);
                break;
            case "merge":
                yield* nToOne(input, action, async (inputs) => {
                    const newPdf = await Operations.mergePDFs({files: inputs});
                    return newPdf;
                });
                break;
            case "removeBlankPages":
                yield* nToN(input, action, async (input) => {
                    const newPdf = await Operations.removeBlankPages({file: input, whiteThreashold: action.values["whiteThreashold"]});
                    return newPdf;
                });
                break;
            case "rotate":
                yield* nToN(input, action, async (input) => {
                    const newPdf = await Operations.rotatePages({file: input, rotation: action.values["rotation"]});
                    return newPdf;
                });
                break;
            case "sortPagesWithPreset":
                yield* nToN(input, action, async (input) => {
                    const newPdf = await Operations.arrangePages({file: input, arrangementConfig: action.values["arrangementConfig"]});
                    return newPdf;
                });
                break;
            case "split":
                // TODO: A split might break the done condition, it may count multiple times. Needs further testing!
                yield* oneToN(input, action, async (input) => {
                    const splitResult = await Operations.splitPdfByIndex({file: input, pageIndexes: action.values["splitAfterPageArray"]});
                    for (let j = 0; j < splitResult.length; j++) {
                        splitResult[j].filename = splitResult[j].filename + "_split" + j;
                    }
                    return splitResult;
                });
                break;
            case "splitOn":
                yield* oneToN(input, action, async (input) => {
                    const splitResult = await Operations.splitPagesByPreset({file: input, type: action.values["type"], whiteThreashold: action.values["whiteThreashold"]});
                    for (let j = 0; j < splitResult.length; j++) {
                        splitResult[j].filename = splitResult[j].filename + "_split" + j;
                    }
                    return splitResult;
                });
                break;
            case "updateMetadata":
                yield* nToN(input, action, async (input) => {
                    const newPdf = await Operations.updateMetadata({file: input, ...action.values["metadata"]});
                    return newPdf;
                });
                break;*/
            default:
                const operator = getOperatorByName(action.type);
                if(operator) {
                    let opteration = new operator(action);
                    input = await opteration.run(input, progressCallback);
                    await nextOperation(action.actions, input, progressCallback);
                }
                else
                    throw new Error(`${action.type} not implemented yet.`);
        }
    }
}