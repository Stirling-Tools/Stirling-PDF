
import { PdfFile } from '../wrappers/PdfFile.js';
import { sorts } from './common/pageIndexesSorting.js';
import { getPages } from './common/getPagesByIndex.js';

export type SortPagesWithPresetParamsType = {
    file: PdfFile;
    sortPreset: string;
}
export async function sortPagesWithPreset(params: SortPagesWithPresetParamsType) {
    const { file, sortPreset } = params;
    const pdfLibDocument = await file.pdfLibDocument;

    if (!(sortPreset in sorts)) {
        throw new Error("Supplied parameters not supported");
    }

    const sortFunction = sorts[sortPreset];
    const pageCount = pdfLibDocument.getPageCount();
    const sortIndexes = sortFunction(pageCount);
    
    const newFile = await getPages(file, sortIndexes);
    newFile.filename += "_sortedPages"
    return newFile;
}
