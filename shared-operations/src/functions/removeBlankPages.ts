
import { PdfFile } from "../wrappers/PdfFile.js";
import { detectEmptyPages } from "./common/detectEmptyPages.js";
import { getPages } from "./common/getPagesByIndex.js";
import { invertSelection } from "./common/pageIndexesUtils.js";

export interface RemoveBlankPagesParamsType {
    file: PdfFile;
    whiteThreashold: number;
}
export async function removeBlankPages(params: RemoveBlankPagesParamsType) {
    const { file, whiteThreashold } = params;
    const pdfDoc = await file.pdfLibDocument;
    const pageCount = pdfDoc.getPageCount();

    const emptyPages = await detectEmptyPages(file, whiteThreashold);
    console.debug("Empty Pages: ", emptyPages);
    const pagesToKeep = invertSelection(emptyPages, pageCount);

    const newFile = await getPages(file, pagesToKeep);
    newFile.filename += "_removedBlanks";
    return newFile;
}