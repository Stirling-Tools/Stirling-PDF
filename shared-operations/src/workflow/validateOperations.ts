import { Action } from "../../declarations/Action";
import { getOperatorByName } from "./getOperatorByName";

/** This function validates the "workflow-json" from the API */
export function validateOperations(actions: Action[]): { valid: boolean, reason?: string} {
    for (const action of actions) {
        if (action.type === "wait" || action.type === "done") {
            // TODO: Validate these too ):
            return { valid: true };
        }
        else {
            const operator = getOperatorByName(action.type);
            if(!operator) {
                return { valid: false, reason: `action.type ${action.type} does not exist` }
            }
            const validationResult = new operator(action).validate();

            if(!validationResult.valid) {
                return validationResult;
            }
        }

        if (action.actions) {
            const validationResult = validateOperations(action.actions);

            if(!validationResult.valid) {
                return validationResult;
            }
        }
    }
    return { valid: true };
}