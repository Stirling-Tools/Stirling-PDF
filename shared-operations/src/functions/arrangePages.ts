import { PdfFile } from "../wrappers/PdfFile";
import { Sorts } from "./common/pageIndexesSorting";
import { getPages } from "./common/getPagesByIndex";
import { parsePageIndexSpecification } from "./common/pageIndexesUtils";

export interface ArrangePagesParamsType {
    file: PdfFile;
    arrangementConfig: string; // a member of Sorts, or a page index specification
}
export async function arrangePages(params: ArrangePagesParamsType) {
    const { file, arrangementConfig } = params;
    const pdfLibDocument = await file.pdfLibDocument;
    const pageCount = pdfLibDocument.getPageCount();

    let sortIndexes: number[];
    if (arrangementConfig in Sorts) {
        const sortFunction = Sorts[arrangementConfig];
        sortIndexes = sortFunction(pageCount);
    } else {
        sortIndexes = parsePageIndexSpecification(arrangementConfig, pageCount);
    }
    
    const newFile = await getPages(file, sortIndexes);
    newFile.filename += "arrangedPages";
    return newFile;
}
