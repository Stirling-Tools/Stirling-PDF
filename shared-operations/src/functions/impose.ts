
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { FieldConstraint, RecordConstraint } from '../dynamic-ui/OperatorConstraints'
import { IOType, Operator, Progress } from ".";

import * as pdfcpuWrapper from "#pdfcpu"; // This is updated by tsconfig.json/paths for the context (browser, node, etc.) this module is used in.

export type ImposeParamsType = {
    file: PdfFile;
    /** Accepted values are 2, 3, 4, 8, 9, 12, 16 - see: {@link https://pdfcpu.io/generate/nup.html#n-up-value} */
    nup: 2 | 3 | 4 | 8 | 9 | 12 | 16;
    /** A0-A10, other formats available - see: {@link https://pdfcpu.io/paper.html} */
    format: string;
}

export class Impose extends Operator {
    static type: string = "impose";

    static mayInput: IOType = IOType.PDF;
    static willOutput: IOType = IOType.PDF;

    /** PDF-Imposition, PDF-N-Up: Put multiple pages of the input document into a single page of the output document. - see: {@link https://en.wikipedia.org/wiki/N-up}  */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return this.nToN<PdfFile, PdfFile>(input, async (input, index, max) => {
            // https://pdfcpu.io/generate/nup.html
            const uint8Array = await pdfcpuWrapper.oneToOne(
                [
                    "pdfcpu.wasm",
                    "nup",
                    "-c",
                    "disable",
                    'f:' + this.actionValues.format,
                    "/output.pdf",
                    String(this.actionValues.nup),
                    "input.pdf",
                ],
                await input.uint8Array
            );

            const result = new PdfFile(
                input.originalFilename,
                uint8Array,
                RepresentationType.Uint8Array,
                input.filename + "_imposed"
            );

            progressCallback({ curFileProgress: 1, operationProgress: index/max })
            
            console.log("ImposeResult: ", result);
            return [result];
        })
    }

    validate(): { valid: boolean; reason?: string | undefined; } {
        let baseValidationResults = super.validate();
        if(!baseValidationResults.valid)
            return baseValidationResults;

        // TODO: This should be ported to SaudF's RecordValidator
        if(this.actionValues.nup) {
            if(![2, 3, 4, 8, 9, 12, 16].includes(this.actionValues.nup)) {
                return  { valid: false, reason: "NUp accepted values are 2, 3, 4, 8, 9, 12, 16 - see: https://pdfcpu.io/generate/nup.html#n-up-value"}
            }
        }
        else
            return { valid: false, reason: "nup is not defined" }

        if(!this.actionValues.format) {
            return { valid: false, reason: "format is not defined" }
        }
        // TODO: Format should be checked for all acceped formats

        return { valid: true }
    }
}

export const ImposeParamConstraints = new RecordConstraint({
    file: new FieldConstraint("display.key", "file.pdf", true, "hint.key"),
    nup: new FieldConstraint("display.key", [2, 3, 4, 8, 9, 12, 16], true, "hint.key"),
    format: new FieldConstraint("display.key", ["A0","A1","A2","A3","A4","A5","A6","A7","A8","A9","A10","Letter","Legal"], true, "hint.key"),
})