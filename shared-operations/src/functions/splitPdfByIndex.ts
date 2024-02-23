
import { PdfFile } from "../wrappers/PdfFile";
import { parsePageIndexSpecification } from "./common/pageIndexesUtils";
import { splitPagesByIndex } from "./common/splitPagesByIndex";

export interface SplitPdfByIndexParamsType {
    file: PdfFile;
    pageIndexes: string | number[];
}
export async function splitPdfByIndex(params: SplitPdfByIndexParamsType): Promise<PdfFile[]> {
    const { file, pageIndexes } = params;
    const pdfLibDocument = await file.pdfLibDocument;

    let indexes = pageIndexes;

    if (!Array.isArray(indexes)) {
        indexes = parsePageIndexSpecification(indexes, pdfLibDocument.getPageCount());
    }

    const newFiles = await splitPagesByIndex(file, indexes);
    for (let i = 0; i < newFiles.length; i++) {
        newFiles[i].filename += "_split-"+i;
    }
    return newFiles;
}
