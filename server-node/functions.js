import PDFLib from 'pdf-lib';
import PDFJS from "pdfjs-dist";
import jsQR from "jsqr";

delete global.crypto; // TODO: I hate to do this, but the new node version forces me to, if anyone finds a better solution, please tell me!
import * as pdfcpuWraopper from "../shared-operations/wasm/pdfcpu/pdfcpu-wrapper-node.js";
import OpenCV from 'opencv-wasm';

import { extractPages as dependantExtractPages } from "../shared-operations/functions/extractPages.js";
import { impose as dependantImpose } from '../shared-operations/functions/impose.js';
import { mergePDFs as dependantMergePDFs } from '../shared-operations/functions/mergePDFs.js';
import { rotatePages as dependantRotatePages } from '../shared-operations/functions/rotatePages.js';
import { scaleContent as dependantScaleContent} from '../shared-operations/functions/scaleContent.js';
import { scalePage as dependantScalePage } from '../shared-operations/functions/scalePage.js';
import { splitPDF as dependantSplitPDF } from '../shared-operations/functions/splitPDF.js';
import { editMetadata as dependantEditMetadata } from '../shared-operations/functions/editMetadata.js';
import { organizePages as dependantOrganizePages } from '../shared-operations/functions/organizePages.js';
import { removeBlankPages as dependantRemoveBlankPages} from '../shared-operations/functions/removeBlankPages.js';
import { splitOn as dependantSplitOn } from "../shared-operations/functions/splitOn.js";

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
    return dependantSplitOn(snapshot, type, whiteThreashold, PDFJS, OpenCV, PDFLib, jsQR);
}