import PDFLib from 'pdf-lib';
import PDFJS from "pdfjs-dist";

delete global.crypto; // TODO: I hate to do this, but the new node version forces me to, if anyone finds a better solution, please tell me!
import * as pdfcpuWraopper from "./public/wasm/pdfcpu-wrapper-node.js";
import OpenCV from 'opencv-wasm';

import { extractPages as dependantExtractPages } from "./public/functions/extractPages.js";
import { impose as dependantImpose } from './public/functions/impose.js';
import { mergePDFs as dependantMergePDFs } from './public/functions/mergePDFs.js';
import { rotatePages as dependantRotatePages } from './public/functions/rotatePages.js';
import { scaleContent as dependantScaleContent} from './public/functions/scaleContent.js';
import { scalePage as dependantScalePage } from './public/functions/scalePage.js';
import { splitPDF as dependantSplitPDF } from './public/functions/splitPDF.js';
import { editMetadata as dependantEditMetadata } from './public/functions/editMetadata.js';
import { organizePages as dependantOrganizePages } from './public/functions/organizePages.js';
import { removeBlankPages as dependantRemoveBlankPages} from './public/functions/removeBlankPages.js';
import { splitOn as dependantSplitOn } from "./public/functions/splitOn.js";

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
    return dependantRemoveBlankPages(snapshot, whiteThreashold, PDFJS, OpenCV, PDFLib);
}

export async function splitOn(snapshot, type, whiteThreashold) {
    return dependantSplitOn(snapshot, type, whiteThreashold, PDFJS, OpenCV, PDFLib);
}