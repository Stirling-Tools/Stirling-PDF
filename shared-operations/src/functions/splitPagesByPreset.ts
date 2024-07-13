import { Operator, Progress, oneToN } from ".";

import { PdfFile } from "../wrappers/PdfFile";

import { splitPagesByIndex } from "./common/splitPagesByIndex";
import { detectEmptyPages } from "./common/detectEmptyPages";
import { detectQRCodePages } from "./common/detectQRCodePages";

export class SplitPagesByPreset extends Operator {
    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToN<PdfFile, PdfFile>(input, async (input, index, max) => {
            let splitAtPages: number[];
            console.log("Running Detection...");

            switch (this.actionValues.type) {
                case "BAR_CODE":
                    // TODO: Implement
                    throw new Error("This split-type has not been implemented yet");

                case "QR_CODE":
                    splitAtPages = await detectQRCodePages(input);
                    break;

                case "BLANK_PAGE":
                    splitAtPages = await detectEmptyPages(input, this.actionValues.whiteThreashold);
                    break;
                
                default:
                    throw new Error("An invalid split-type was provided.");
            }
            console.log("Split at Pages: ", splitAtPages);

            const newFiles = await splitPagesByIndex(input, splitAtPages);
            for (let i = 0; i < newFiles.length; i++) {
                newFiles[i].filename += "_split-"+i;
            }
            progressCallback({ curFileProgress: 1, operationProgress: index/max });
            return newFiles;
        });
    }
}
