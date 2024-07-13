import { Operator, Progress, oneToOne } from ".";

import { PdfFile } from "../wrappers/PdfFile";
import { detectEmptyPages } from "./common/detectEmptyPages";
import { getPages } from "./common/getPagesByIndex";
import { invertSelection } from "./common/pageIndexesUtils";

export class RemoveBlankPages extends Operator {
    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {
            const pdfDoc = await input.pdfLibDocument;
            const pageCount = pdfDoc.getPageCount();

            progressCallback({ curFileProgress: 0, operationProgress: index/max });
            const emptyPages = await detectEmptyPages(input, this.actionValues.whiteThreashold);
            progressCallback({ curFileProgress: 0.6, operationProgress: index/max });
            const pagesToKeep = invertSelection(emptyPages, pageCount);
            progressCallback({ curFileProgress: 0.3, operationProgress: index/max });

            const result = await getPages(input, pagesToKeep);
            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            result.filename += "_removedBlanks";
            return result;
        });
    }
}
