
import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";

import * as pdfcpuWrapper from "#pdfcpu"; // This is updated by tsconfig.json/paths for the context (browser, node, etc.) this module is used in.

export class Impose extends Operator {
    /** PDF-Imposition, PDF-N-Up: Put multiple pages of the input document into a single page of the output document. - see: {@link https://en.wikipedia.org/wiki/N-up}  */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {
            //TODO: Support custom Page Sizes
            // https://pdfcpu.io/generate/nup.html
            const uint8Array = await pdfcpuWrapper.oneToOne(
                [
                    "pdfcpu.wasm",
                    "nup",
                    "formsize:" + this.actionValues.format, // configuration string
                    "/output.pdf", // outFile
                    String(this.actionValues.nup), // nupvalue
                    "/input.pdf" // infile
                ],
                await input.uint8Array
            );

            const result = new PdfFile(
                input.originalFilename,
                uint8Array,
                RepresentationType.Uint8Array,
                input.filename + "_imposed"
            );

            progressCallback({ curFileProgress: 1, operationProgress: index/max });
            
            console.log("ImposeResult: ", result);
            return result;
        });
    }
}
