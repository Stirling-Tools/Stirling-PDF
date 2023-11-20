import { Action } from "../../declarations/Action";

export function validateOperations(actions: Action[]): { valid: boolean, reason?: string} {
    // TODO: Validate using inbuilt validators: 
    /*
        validationResult = impose.validate()
        if(validationResult.valid) {
            // Check Next
        }
        else {
            return validationResult.reason
        }
    */

    return { valid: true };
}