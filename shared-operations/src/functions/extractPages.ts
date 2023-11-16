
import { PdfFile } from '../wrappers/PdfFile.js';
import { getPages } from './common/getPagesByIndex.js';

export type ExtractPagesParamsType = {
    file: PdfFile;
    pageIndexes: string | number[];
}
export async function extractPages(params: ExtractPagesParamsType) {
    const { file, pageIndexes } = params;
    const pdfLibDocument = await file.pdfLibDocument;

    var indexes = pageIndexes;

    if (!Array.isArray(indexes)) {
        indexes = parsePageIndexSpecification(indexes, pdfLibDocument.getPageCount());
    }

    return getPages(file, indexes);
}
