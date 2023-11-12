
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

export default {
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