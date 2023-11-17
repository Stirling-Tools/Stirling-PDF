
import { PdfFile } from '../wrappers/PdfFile.js';
import { getPages } from './common/getPagesByIndex.js';
import { parsePageIndexSpecification } from './common/pageIndexesUtils'

export type ExtractPagesParamsType = {
    file: PdfFile;
    pageIndecies: string | number[];
}
export async function extractPages(params: ExtractPagesParamsType): Promise<PdfFile> {
    const { file, pageIndecies: pageIndecies } = params;
    const pdfLibDocument = await file.pdfLibDocument;

    var indecies = pageIndecies;

    if (!Array.isArray(indecies)) {
        indecies = parsePageIndexSpecification(indecies, pdfLibDocument.getPageCount());
    }

    const newFile = await getPages(file, indecies);
    newFile.filename += "_extractedPages"
    return newFile;
}
