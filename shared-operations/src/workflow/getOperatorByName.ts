import { Operator } from "../functions";

// TODO: Import other Operators
import { Impose } from "../functions/impose";
export const Operators = {
    Impose: Impose
}

// TODO: Convert this to a map or similar
export function getOperatorByName(name: string): typeof Operator {
    let foundClass: typeof Operator = null;

    // Loop over each default export
    Object.entries(Operators).some(([className, exportedClass]) => {
        // Check if the exported item is a class
        if (typeof exportedClass === 'function' && exportedClass.prototype) {
            if (exportedClass.type === name) {
                foundClass = exportedClass;
                return true; // Stop the iteration
            }
        }
        return false;
    });
    
    return foundClass;
}