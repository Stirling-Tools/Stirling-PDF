import { Operator } from "../functions";

// TODO: Import other Operators (could make this dynamic)
import { Impose } from "../functions/impose";
export const Operators = {
    Impose: Impose
};

// TODO: Convert this to a map or similar
export function getOperatorByName(name: string): typeof Operator | undefined {
    let foundClass: typeof Operator | undefined = undefined;

    // Loop over each default export
    Object.entries(Operators).some(([className, exportedClass]) => {
        // Check if the exported item is a class
        if (typeof exportedClass === "function" && exportedClass.prototype) {
            if (exportedClass.type === name) {
                foundClass = exportedClass;
                return true; // Stop the iteration
            }
        }
        return false;
    });
    
    return foundClass;
}

export function listOperatorNames(): string[] {
    // TODO: Implement this
    return ["impose"];
}
