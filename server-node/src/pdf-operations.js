
import { editMetadata as dependantEditMetadata } from '@stirling-pdf/shared-operations/functions/editMetadata.js';
import { extractPages as dependantExtractPages } from '@stirling-pdf/shared-operations/functions/extractPages.js';
import { mergePDFs as dependantMergePDFs } from '@stirling-pdf/shared-operations/functions/mergePDFs.js';
import { organizePages as dependantOrganizePages } from '@stirling-pdf/shared-operations/functions/organizePages.js';
import { rotatePages as dependantRotatePages } from '@stirling-pdf/shared-operations/functions/rotatePages.js';
import { scaleContent as dependantScaleContent} from '@stirling-pdf/shared-operations/functions/scaleContent.js';
import { scalePage as dependantScalePage } from '@stirling-pdf/shared-operations/functions/scalePage.js';
import { splitPDF as dependantSplitPDF } from '@stirling-pdf/shared-operations/functions/splitPDF.js';

export async function editMetadata(snapshot, metadata) {
    return dependantEditMetadata(snapshot, metadata);
}

export async function extractPages(snapshot, pagesToExtractArray) {
    return dependantExtractPages(snapshot, pagesToExtractArray);
}

export async function mergePDFs(snapshots) {
    return dependantMergePDFs(snapshots);
}

export async function organizePages(snapshot, operation, customOrderString) {
    return dependantOrganizePages(snapshot, operation, customOrderString);
}

export async function rotatePages(snapshot, rotation) {
    return dependantRotatePages(snapshot, rotation);
}

export async function scaleContent(snapshot, scaleFactor) {
    return dependantScaleContent(snapshot, scaleFactor);
}

export async function scalePage(snapshot, pageSize) {
    return dependantScalePage(snapshot, pageSize);
}

export async function splitPDF(snapshot, splitAfterPageArray) {
    return dependantSplitPDF(snapshot, splitAfterPageArray);
}
