// PDFLib gets importet via index.html script-tag
// TODO: OpenCV wasm js from browser
import * as pdfcpuWraopper from "./wasm/pdfcpu-wrapper-browser.js";

import { extractPages as dependantExtractPages } from "./functions/extractPages.js";
import { impose as dependantImpose } from './functions/impose.js';
import { mergePDFs as dependantMergePDFs } from './functions/mergePDFs.js';
import { rotatePages as dependantRotatePages } from './functions/rotatePages.js';
import { scaleContent as dependantScaleContent} from './functions/scaleContent.js';
import { scalePage as dependantScalePage } from './functions/scalePage.js';
import { splitPDF as dependantSplitPDF } from './functions/splitPDF.js';
import { editMetadata as dependantEditMetadata} from "./functions/editMetadata.js";
import { organizePages as dependantOrganizePages} from "./functions/organizePages.js";
import { removeBlankPages as dependantRemoveBlankPages} from "./functions/removeBlankPages.js";

export async function extractPages(snapshot, pagesToExtractArray) {
    return dependantExtractPages(snapshot, pagesToExtractArray, PDFLib);
}

export async function impose(snapshot, nup, format) {
    return dependantImpose(snapshot, nup, format, pdfcpuWraopper);
}

export async function mergePDFs(snapshots) {
    return dependantMergePDFs(snapshots, PDFLib);
}

export async function rotatePages(snapshot, rotation) {
    return dependantRotatePages(snapshot, rotation, PDFLib);
}

export async function scaleContent(snapshot, scaleFactor) {
    return dependantScaleContent(snapshot, scaleFactor, PDFLib);
}

export async function scalePage(snapshot, pageSize) {
    return dependantScalePage(snapshot, pageSize, PDFLib);
}

export async function splitPDF(snapshot, splitAfterPageArray) {
    return dependantSplitPDF(snapshot, splitAfterPageArray, PDFLib);
}

export async function editMetadata(snapshot, metadata) {
    return dependantEditMetadata(snapshot, metadata, PDFLib);
}

export async function organizePages(snapshot, operation, customOrderString) {
    return dependantOrganizePages(snapshot, operation, customOrderString, PDFLib);
}

export async function removeBlankPages(snapshot, whiteThreashold) {
    return dependantRemoveBlankPages(snapshot, whiteThreashold, PDFLib, OpenCV);
}