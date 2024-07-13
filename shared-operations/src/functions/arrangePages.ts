import { Operator, Progress, oneToOne } from ".";

import { PdfFile } from "../wrappers/PdfFile";
import { Sorts } from "./common/pageIndexesSorting";
import { getPages } from "./common/getPagesByIndex";

export class ArrangePages extends Operator {
    /** Detect and remove white pages */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {
            const pdfLibDocument = await input.pdfLibDocument;
            const pageCount = pdfLibDocument.getPageCount();

            const sortFunction = Sorts[this.actionValues.arrangementConfig];
            let sortIndexes = sortFunction(pageCount);
            
            const newFile = await getPages(input, sortIndexes);
            newFile.filename += "arrangedPages";

            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return newFile;
        });
    }
}