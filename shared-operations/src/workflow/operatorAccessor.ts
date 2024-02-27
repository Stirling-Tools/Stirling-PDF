import { Operator } from "../functions";
import i18next from "i18next";

const compileTimeOperatorList: string[] = ["impose"]; import.meta.compileTime("./listOperatorsInDir.ts"); // The will compile to ["impose", "extractPages", etc...]

export async function getOperatorByName(name: string): Promise<typeof Operator | undefined> {
    // Check if exists
    if(!compileTimeOperatorList.includes(name)) return;

    i18next.loadNamespaces(name, (err, t) => { if (err) throw err; });
    const loadedModule = await import("../functions/" + name + ".ts");
    return loadedModule[capitalizeFirstLetter(name)];
}

export function listOperatorNames(): string[] {
    const availableOperators = compileTimeOperatorList;
    // TODO: Implement this
    return availableOperators;
}

function capitalizeFirstLetter(string: String) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}