import { Operator } from "../functions";
import i18next from "i18next";

// TODO: Import other Operators (should make this dynamic imports)
i18next.loadNamespaces("impose", (err, t) => { if (err) throw err; });
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
