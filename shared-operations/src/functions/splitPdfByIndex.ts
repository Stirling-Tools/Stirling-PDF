import { PdfFile } from "../wrappers/PdfFile";
import { Operator, Progress, oneToN } from ".";

import Joi from "@stirling-tools/joi";

import { splitPagesByIndex } from "./common/splitPagesByIndex";

export class SplitPdfByIndex extends Operator {
    /** PDF extraction, specify pages from one pdf and output them to a new pdf */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToN<PdfFile, PdfFile>(input, async (input, index, max) => {

            const newFiles = await splitPagesByIndex(input, this.actionValues.pageIndexes);
            for (let i = 0; i < newFiles.length; i++) {
                newFiles[i].filename += "_split-" + i;
            }
            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return newFiles;
        });
    }
}