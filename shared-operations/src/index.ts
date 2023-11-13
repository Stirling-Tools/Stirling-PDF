
// Import injected libraries here!

import { sortPagesWithPreset, rearrangePages, selectPages, removePages, removeBlankPages } from "./functions/subDocumentFunctions";
import { impose } from "./functions/impose";
import { mergePDFs } from './functions/mergePDFs';
import { rotatePages } from './functions/rotatePages';
import { scaleContent} from './functions/scaleContent';
import { scalePage } from './functions/scalePage';
import { splitOn } from './functions/splitOn';
import { splitPDF } from './functions/splitPDF';
import { updateMetadata } from "./functions/updateMetadata";

const toExport = {
    sortPagesWithPreset, rearrangePages, selectPages, removePages, removeBlankPages,
    impose,
    mergePDFs,
    rotatePages,
    scaleContent,
    scalePage,
    splitOn,
    splitPDF,
    updateMetadata,
}
export default toExport;

// Overide fields in the type of toExport, with the given fields and types. This seems to magically work!
// https://dev.to/vborodulin/ts-how-to-override-properties-with-type-intersection-554l
type Override<T1, T2> = Omit<T1, keyof T2> & T2;
export type OperationsUseages = Override<typeof toExport, {
    impose: (snapshot: any, nup: number, format: string) => any;
}>;