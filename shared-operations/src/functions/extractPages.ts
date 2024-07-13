import { PdfFile } from "../wrappers/PdfFile";
import { Operator, Progress, oneToOne } from ".";
import { getPages } from "./common/getPagesByIndex";

export class ExtractPages extends Operator {
    /** PDF extraction, specify pages from one pdf and output them to a new pdf */
    async run(input: PdfFile[], progressCallback: (state: Progress) => void): Promise<PdfFile[]> {
        return oneToOne<PdfFile, PdfFile>(input, async (input, index, max) => {

            const newFile = await getPages(input, this.actionValues.pageIndexes);
            newFile.filename += "_extractedPages";
            progressCallback({ curFileProgress: 1, operationProgress: index/max });

            return newFile;
        });
    }
}
