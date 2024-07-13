import { Action } from "../../declarations/Action";
import { PdfFile } from "../wrappers/PdfFile";

export function organizeWaitOperations(actions: Action[]) {

    // Initialize an object to store the counts and associated "done" operations
    const waitCounts: Record<string, number> = {};
    const doneOperations: Record<string, Action> = {};

    // Function to count "type: wait" operations and associate "done" operations per id
    function countWaitOperationsAndDone(actions: Action[]) {
        for (const action of actions) {
            if (action.type === "wait") {
                const id = action.values.id;
                if (id in waitCounts) {
                    waitCounts[id]++;
                } else {
                    waitCounts[id] = 1;
                }
            }
            if (action.type === "done") {
                const id = action.values.id;
                doneOperations[id] = action;
            }
            if (action.actions) {
                countWaitOperationsAndDone(action.actions);
            }
        }
    }

    // Start counting and associating from the root operations
    countWaitOperationsAndDone(actions);

    // Combine counts and associated "done" operations
    const result: ResultType = {};
    for (const id in waitCounts) {
        result[id] = {
            waitCount: waitCounts[id],
            doneOperation: doneOperations[id],
            input: []
        };
    }
    return result;
}

export type ResultType = Record<string, {
    waitCount: number,
    doneOperation: Action,
    input: PdfFile[]
}>;