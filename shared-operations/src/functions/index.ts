import { PdfFile } from "../wrappers/PdfFile";
import { Action } from "../../declarations/Action";
import Joi from "@stirling-tools/joi";
import { MaterialSymbolProps } from "react-material-symbols";


export interface ValidationResult { 
    valid: boolean, 
    reason?: string 
}

export interface Progress {
    /** A percentage between 0-1 describing the progress on the currently processed file */
    curFileProgress: number,
    /** A percentage between 0-1 describing the progress on all input files / operations */
    operationProgress: number,
}

export class Operator {
    actionValues: any = undefined;

    constructor (action: Action) {
        this.actionValues = action.values;
    }

    async run(input: PdfFile[] | any[], progressCallback: (progress: Progress) => void): Promise<PdfFile[] | any[]> {
        throw new Error("Operator.run() was called directly. This is not the desired behavior; call the Subclass's run function instead.");
        // For reference:
        progressCallback({ curFileProgress: 1, operationProgress: 1 });
        return input;
    }
}

export enum OperatorAvailability {Serverside, Clientside, Both}

export class OperatorSchema {
    schema: Joi.ObjectSchema<any>;
    materialSymbolName: MaterialSymbolProps["icon"] | undefined;
    availability: OperatorAvailability;

    constructor(params: {
        joi: {
            label: string;
            description: string;
            inputSchema: Joi.Schema;
            valueSchema: Joi.Schema;
            outputSchema: Joi.Schema;
        }, 
        materialSymbolName?: MaterialSymbolProps["icon"],
        availability: OperatorAvailability
    }) {
        this.schema = Joi.object({
            input: params.joi.inputSchema,
            values: params.joi.valueSchema.required(),
            output: params.joi.outputSchema
        }).label(params.joi.label).description(params.joi.description);
        this.materialSymbolName = params.materialSymbolName;
        this.availability = params.availability;
    }
}

/** This function should be used if the Operation may take multiple files as inputs and only outputs one file */
export async function nToOne <I, O>(inputs: I[], callback: (input: I[]) => Promise<O>): Promise<O[]> {
    return [await callback(inputs)];
}

/** This function should be used if the Operation takes one file as input and may output multiple files */
export async function oneToN <I, O>(inputs: I[], callback: (input: I, index: number, max: number) => Promise<O[]>): Promise<O[]> {
    let output: O[] = [];
    for (let i = 0; i < inputs.length; i++) {
        output = output.concat(await callback(inputs[i], i, inputs.length));
    }
    return output;
}

/** This function should be used if the Operation takes one file as input and outputs only one file */
export async function oneToOne <I, O>(inputs: I[], callback: (input: I, index: number, max: number) => Promise<O>): Promise<O[]> {
    return oneToN(inputs, async (input, index, max) => {
        return [await callback(input, index, max)];
    });
}