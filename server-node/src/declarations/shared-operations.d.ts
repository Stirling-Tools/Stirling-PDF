
declare module '@stirling-pdf/shared-operations/wasm/pdfcpu/pdfcpu-wrapper-node.js' {
    export async function oneToOne(wasmArray: any, snapshot: any): Promise<Uint8Array>;
}

declare module '@stirling-pdf/shared-operations/workflow/traverseOperations.js' {
    export type PDF = {
        originalFileName: string;
        fileName: string;
        buffer: Uint8Array;
    }
    export async function * traverseOperations(operations: any, input: PDF|PDF[], Operations: any);
}
