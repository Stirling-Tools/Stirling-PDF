import { organizeWaitOperations } from "./organizeWaitOperations";
import { Action, WaitAction } from "../../declarations/Action";
import { PdfFile } from "../wrappers/PdfFile";
import { Progress } from "../functions";
import { validateOperations } from "./validateOperations";
import { getOperatorByName } from "./operatorAccessor";

export async function traverseOperations(operations: Action[], input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
    const validationResult = await validateOperations(operations);
    if(!validationResult.valid) {
        return Promise.reject({validationError: validationResult.reason});
    }
    
    const waitOperations = organizeWaitOperations(operations);

    let results: PdfFile[] = [];
    await nextOperation(operations, input, progressCallback);
    return results;

    async function nextOperation(actions: Action[] | undefined, input: PdfFile[], progressCallback: (state: Progress) => void): Promise<void> {
        if(!actions || (Array.isArray(actions) && actions.length == 0)) { // isEmpty
            if(input && Array.isArray(input)) {
                console.log("operation done: " + input[0].filename + (input.length > 1 ? "+" : ""));
                results = results.concat(input);
            }
            return;
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

            waitOperation.input.concat(input); // TODO: May have unexpected concequences. Needs further testing!

            waitOperation.waitCount--;
            if(waitOperation.waitCount == 0 && waitOperation.doneOperation.actions) {
                await nextOperation(waitOperation.doneOperation.actions, waitOperation.input, progressCallback);
            }
            break;
        default:
            const operator = await getOperatorByName(action.type);
            if(operator) {
                const operation = new operator(action);
                input = await operation.run(input, progressCallback);
                await nextOperation(action.actions, input, progressCallback);
            }
            else
                throw new Error(`${action.type} not implemented yet.`);
        }
    }
}