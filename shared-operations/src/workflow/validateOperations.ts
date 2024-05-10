import { Operator } from "../functions";
import { Action } from "../../declarations/Action";
import { getOperatorByName } from "./operatorAccessor";

/** This function validates the "workflow-json" from the API */
export async function validateOperations(actions: Action[]): Promise<{ valid: boolean, reason?: string}> {
    const done: Action[] = [];
    for (const action of actions) {
        if (action.type === "done") {
            if(done[action.values.id] !== undefined) {
                return { valid: false, reason: "There is a duplicate id in the done actions." };
            }
            done[action.values.id] = action;
            continue;
        }
        
        const operator = await getOperatorByName(action.type);
        if(!operator) {
            return { valid: false, reason: `action.type ${action.type} does not exist` };
        }
        const validationResult = operator.schema.validate({values: action.values});

        // TODO: convert everything to joiresult format
        if(validationResult.error) {
            return { valid: false, reason: validationResult.error.message};
        }

        if (action.actions) {
            // Check io compatibility of the operators
            for (const childAction of action.actions) {
                if (childAction.type === "wait") {
                    if(done[childAction.values.id] === undefined) {
                        return { valid: false, reason: "There is a wait action that does not have an associated done action." };
                    }

                    for (const afterDoneChild of done[childAction.values.id]?.actions || []) {
                        const receivingOperator = await getOperatorByName(afterDoneChild.type);
                        if (receivingOperator === undefined) {
                            return { valid: false, reason: `action.type ${afterDoneChild.type} does not exist.` };
                        } else if (!ioCompatible(operator, receivingOperator)) {
                            return { valid: false, reason: `Ouput of action ${action.type} is not compatible with input of action ${afterDoneChild.type}` };
                        }
                    }
                }
                else if (action.type === "done") {
                    return { valid: false, reason: "There shouldn't be a done action here." };
                }
                else {
                    const receivingOperator = await getOperatorByName(childAction.type);
                    if (receivingOperator === undefined) {
                        return { valid: false, reason: `action.type ${childAction.type} does not exist.` };
                    } else if (!ioCompatible(operator, receivingOperator)) {
                        return { valid: false, reason: `Ouput of action ${action.type} is not compatible with input of action ${childAction.type}` };
                    }
                }
            }

            const validationResult = await validateOperations(action.actions);

            if(!validationResult.valid) {
                return validationResult;
            }
        }
    }
    return { valid: true };
}

function ioCompatible(outputingOperator: typeof Operator, receivingOperator: typeof Operator): boolean {
    const outputType = outputingOperator.schema.describe().keys.output.label;
    const inputType = receivingOperator.schema.describe().keys.input.label;
    return outputType == inputType;
}
