
import { PdfFile } from "../wrappers/PdfFile";
import { getPages } from "./common/getPagesByIndex";
import { parsePageIndexSpecification } from "./common/pageIndexesUtils";

export interface ExtractPagesParamsType {
    file: PdfFile;
    pageIndexes: string | number[];
}
export async function extractPages(params: ExtractPagesParamsType): Promise<PdfFile> {
    const { file, pageIndexes } = params;
    const pdfLibDocument = await file.pdfLibDocument;

    let indexes = pageIndexes;

    if (!Array.isArray(indexes)) {
        indexes = parsePageIndexSpecification(indexes, pdfLibDocument.getPageCount());
    }

    const newFile = await getPages(file, indexes);
    newFile.filename += "_extractedPages";
    return newFile;
}
