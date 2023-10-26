import PDFLib from 'pdf-lib';
import * as pdfcpuWraopper from "./wasm/pdfcpu-wrapper-node.js";

import { editMetadata as dependantEditMetadata } from '@stirling-pdf/shared-operations/functions/editMetadata.js';
import { extractPages as dependantExtractPages } from '@stirling-pdf/shared-operations/functions/extractPages.js';
import { impose as dependantImpose } from '@stirling-pdf/shared-operations/functions/impose.js';
import { mergePDFs as dependantMergePDFs } from '@stirling-pdf/shared-operations/functions/mergePDFs.js';
import { organizePages as dependantOrganizePages } from '@stirling-pdf/shared-operations/functions/organizePages.js';
import { rotatePages as dependantRotatePages } from '@stirling-pdf/shared-operations/functions/rotatePages.js';
import { scaleContent as dependantScaleContent} from '@stirling-pdf/shared-operations/functions/scaleContent.js';
import { scalePage as dependantScalePage } from '@stirling-pdf/shared-operations/functions/scalePage.js';
import { splitPDF as dependantSplitPDF } from '@stirling-pdf/shared-operations/functions/splitPDF.js';

export async function editMetadata(snapshot, metadata) {
    return dependantEditMetadata(snapshot, metadata, PDFLib);
}

export async function extractPages(snapshot, pagesToExtractArray) {
    return dependantExtractPages(snapshot, pagesToExtractArray, PDFLib);
}

export async function impose(snapshot, nup, format) {
    return dependantImpose(snapshot, nup, format, pdfcpuWraopper);
}

export async function mergePDFs(snapshots) {
    return dependantMergePDFs(snapshots, PDFLib);
}

export async function organizePages(snapshot, operation, customOrderString) {
    return dependantOrganizePages(snapshot, operation, customOrderString, PDFLib);
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
