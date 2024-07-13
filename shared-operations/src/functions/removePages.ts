import { PdfFile } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";
import { getPages } from "./common/getPagesByIndex";

import { invertSelection } from "./common/pageIndexesUtils";

export class RemovePages extends Operator {
    /** PDF extraction, specify pages from one pdf and output them to a new pdf */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {

            const pdfDoc = await input.pdfLibDocument;
            const pageCount = pdfDoc.getPageCount();

            const pagesToKeep = invertSelection(this.actionValues.pageIndexes, pageCount);
        
            const newFile = await getPages(input, pagesToKeep);
            newFile.filename += "_removedPages";
            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return newFile;
        });
    }
}