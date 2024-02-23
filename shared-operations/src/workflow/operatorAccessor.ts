import { Operator } from "../functions";
import i18next from "i18next";

function getCompileTimeOperatorList(): string[] {
    return import.meta.compileTime("./listOperatorsInDir.ts"); // The will compile to ["impose", "extractPages", etc...]
}

export async function getOperatorByName(name: string): Promise<typeof Operator | undefined> {
    // Check if exists
    if(!getCompileTimeOperatorList().includes(name)) return;

    i18next.loadNamespaces(name, (err, t) => { if (err) throw err; });
    return (await import("../functions/" + name + ".ts"))[capitalizeFirstLetter(name)];
}

export function listOperatorNames(): string[] {
    const availableOperators = getCompileTimeOperatorList();
    // TODO: Implement this
    return availableOperators;
}

function capitalizeFirstLetter(string: String) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}