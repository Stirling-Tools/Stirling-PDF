
declare module '@stirling-pdf/shared-operations/functions/editMetadata' {
    export type Metadata = {
        Title: string | null | undefined;       // The title of the document.
        Author: string | null | undefined;      // The author of the document.
        Subject: string | null | undefined;     // The subject of the document.
        Keywords: string[] | null | undefined;  // An array of keywords associated with the document.
        Producer: string | null | undefined;    // The producer of the document.
        Creator: string | null | undefined;     // The creator of the document.
        CreationDate: Date | null | undefined;  // The date when the document was created.
        ModificationDate: Date | null | undefined; // The date when the document was last modified.
    }
    export async function editMetadata(snapshot: string | Uint8Array | ArrayBuffer, metadata: Metadata): Promise<Uint8Array>;
}

declare module '@stirling-pdf/shared-operations/functions/extractPages' {
    export async function extractPages(snapshot: string | Uint8Array | ArrayBuffer, pagesToExtractArray: number[]): Promise<Uint8Array>;
    export async function createSubDocument(pdfDoc: typeof import("pdf-lib").PDFDocument, pagesToExtractArray: number[])
}

declare module '@stirling-pdf/shared-operations/functions/mergePDFs' {
    export async function mergePDFs(snapshots: (string | Uint8Array | ArrayBuffer)[]): Promise<Uint8Array>;
}

declare module '@stirling-pdf/shared-operations/functions/organizePages' {
    export async function organizePages(
        snapshot: string | Uint8Array | ArrayBuffer,
        operation: "CUSTOM_PAGE_ORDER" |
                   "REVERSE_ORDER" |
                   "DUPLEX_SORT" |
                   "BOOKLET_SORT" |
                   "ODD_EVEN_SPLIT" |
                   "REMOVE_FIRST" |
                   "REMOVE_LAST" |
                   "REMOVE_FIRST_AND_LAST",
        customOrderString: string): Promise<Uint8Array>;
}

declare module '@stirling-pdf/shared-operations/functions/rotatePages' {
    export async function rotatePages(snapshot: string | Uint8Array | ArrayBuffer, rotation: number): Promise<Uint8Array>;
}

declare module '@stirling-pdf/shared-operations/functions/scaleContent' {
    export async function scaleContent(snapshot: string | Uint8Array | ArrayBuffer, scaleFactor: number): Promise<Uint8Array>;
}

declare module '@stirling-pdf/shared-operations/functions/scalePage' {
    export async function scalePage(snapshot: string | Uint8Array | ArrayBuffer, pageSize: {width:number,height:number}): Promise<Uint8Array>;
}

declare module '@stirling-pdf/shared-operations/functions/splitPDF' {
    export async function splitPDF(snapshot: string | Uint8Array | ArrayBuffer, splitAfterPageArray: number[]): Promise<Uint8Array>;
}
