
// Import injected libraries here!

import { Metadata, editMetadata as dependantEditMetadata} from "@stirling-pdf/shared-operations/functions/editMetadata";
import { extractPages as dependantExtractPages } from "@stirling-pdf/shared-operations/functions/extractPages";
import { mergePDFs as dependantMergePDFs } from '@stirling-pdf/shared-operations/functions/mergePDFs';
import { rotatePages as dependantRotatePages } from '@stirling-pdf/shared-operations/functions/rotatePages';
import { scaleContent as dependantScaleContent} from '@stirling-pdf/shared-operations/functions/scaleContent';
import { scalePage as dependantScalePage } from '@stirling-pdf/shared-operations/functions/scalePage';
import { splitPDF as dependantSplitPDF } from '@stirling-pdf/shared-operations/functions/splitPDF';

export async function editMetadata(snapshot: string | Uint8Array | ArrayBuffer, metadata: Metadata) {
    return dependantEditMetadata(snapshot, metadata);
}

export async function extractPages(snapshot: string | Uint8Array | ArrayBuffer, pageIndexes: number[]) {
    return dependantExtractPages(snapshot, pageIndexes);
}

export async function mergePDFs(snapshots: (string | Uint8Array | ArrayBuffer)[]) {
    return dependantMergePDFs(snapshots);
}

export async function rotatePages(snapshot: string | Uint8Array | ArrayBuffer, rotation: number) {
    return dependantRotatePages(snapshot, rotation);
}

export async function scaleContent(snapshot: string | Uint8Array | ArrayBuffer, scaleFactor: number) {
    return dependantScaleContent(snapshot, scaleFactor);
}

export async function scalePage(snapshot: string | Uint8Array | ArrayBuffer, pageSize: { width: number; height: number; }) {
    return dependantScalePage(snapshot, pageSize);
}

export async function splitPDF(snapshot: string | Uint8Array | ArrayBuffer, splitAfterPageArray: number[]) {
    return dependantSplitPDF(snapshot, splitAfterPageArray);
}
