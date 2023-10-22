import PDFLib from 'pdf-lib';
import * as pdfcpuWraopper from "./public/wasm/pdfcpu-wrapper-node.js";

import { extractPages as dependantExtractPages } from "./public/functions/extractPages.js";
import { impose as dependantImpose } from './public/functions/impose.js';
import { mergePDFs as dependantMergePDFs } from './public/functions/mergePDFs.js';
import { rotatePages as dependantRotatePages } from './public/functions/rotatePages.js';
import { scaleContent as dependantScaleContent} from './public/functions/scaleContent.js';
import { scalePage as dependantScalePage } from './public/functions/scalePage.js';
import { splitPDF as dependantSplitPDF } from './public/functions/splitPDF.js';
import { editMetadata as dependantEditMetadata } from './public/functions/editMetadata.js';

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