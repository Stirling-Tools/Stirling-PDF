import { Operation } from "../../declarations/Operation";

export function organizeWaitOperations(operations: Operation[]) {

    // Initialize an object to store the counts and associated "done" operations
    const waitCounts = {};
    const doneOperations = {};

    // Function to count "type: wait" operations and associate "done" operations per id
    function countWaitOperationsAndDone(operations: Operation[]) {
        for (const operation of operations) {
            if (operation.type === "wait") {
                const id = operation.values.id;
                if (id in waitCounts) {
                    waitCounts[id]++;
                } else {
                    waitCounts[id] = 1;
                }
            }
            if (operation.type === "done") {
                const id = operation.values.id;
                doneOperations[id] = operation;
            }
            if (operation.operations) {
                countWaitOperationsAndDone(operation.operations);
            }
        }
    }

    // Start counting and associating from the root operations
    countWaitOperationsAndDone(operations);

    // Combine counts and associated "done" operations
    const result = {};
    for (const id in waitCounts) {
        result[id] = {
            waitCount: waitCounts[id],
            doneOperation: doneOperations[id],
            input: []
        };
    }
    return result;
}

