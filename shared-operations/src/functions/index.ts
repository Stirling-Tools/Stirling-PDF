import { Action } from "../../declarations/Action";

export enum IOType {
    PDF, Image, Text // TODO: Extend with Document File Types
}

export interface Progress {
    /** 0-1 */
    curFileProgress: number,
    /** 0-1 */
    operationProgress: number,
}

export class Operator {
    /** The type of the operator in camelCase (impose, merge, etc.) */
    static type: string;

    // This will most likely be needed in the node Editor
    static mayInput: IOType;
    static willOutput: IOType;

    actionValues: any;

    constructor (action: Action) {
        this.actionValues = action.values;
    }

    // TODO: Type callback state, it should give updates on the progress of the current operator
    async run(input: any[], progressCallback: (progress: Progress) => void): Promise<any[]> {
        return [];
    }

    validate(): { valid: boolean, reason?: string } {
        if(!this.actionValues) {
            return { valid: false, reason: "The Operators action values were empty."}
        }
        return { valid: true };
    }

    protected async nToOne <I, O>(inputs: I[], callback: (input: I[]) => Promise<O>): Promise<O[]> {
        return [await callback(inputs)];
    }

    protected async oneToN <I, O>(inputs: I[], callback: (input: I, index: number, max: number) => Promise<O[]>): Promise<O[]> {
        return this.nToN(inputs, callback); // nToN is able to handle single inputs now.
    }

    protected async nToN <I, O>(inputs: I[], callback: (input: I, index: number, max: number) => Promise<O[]>): Promise<O[]> {
        let output: O[] = []
        for (let i = 0; i < inputs.length; i++) {
            output = output.concat(await callback(inputs[i], i, inputs.length));
        }

        return output;
    }
}

// TODO: Export Operators?