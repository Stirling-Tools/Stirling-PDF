
import { PdfFile } from '../wrappers/PdfFile.js';
import { getPages } from './common/getPagesByIndex.js';

export type ExtractPagesParamsType = {
    file: PdfFile;
    pageIndexes: string | number[];
}
export async function extractPages(params: ExtractPagesParamsType): Promise<PdfFile> {
    const { file, pageIndexes } = params;
    const pdfLibDocument = await file.pdfLibDocument;

    var indexes = pageIndexes;

    if (!Array.isArray(indexes)) {
        indexes = parsePageIndexSpecification(indexes, pdfLibDocument.getPageCount());
    }

    const newFile = await getPages(file, indexes);
    newFile.filename += "_extractedPages"
    return newFile;
}
