
import { PdfFile } from "../wrappers/PdfFile.js";
import { getPages } from "./common/getPagesByIndex.js";
import { invertSelection, parsePageIndexSpecification } from "./common/pageIndexesUtils.js";

export interface RemovePagesParamsType {
    file: PdfFile;
    pageSelector: string;
}
export async function removePages(params: RemovePagesParamsType) {
    const { file, pageSelector } = params;
    const pdfDoc = await file.pdfLibDocument;
    const pageCount = pdfDoc.getPageCount();

    const pageSelection = parsePageIndexSpecification(pageSelector, pageCount);
    const pagesToKeep = invertSelection(pageSelection, pageCount);

    const newFile = await getPages(file, pagesToKeep);
    newFile.filename += "_removedPages";
    return newFile;
}