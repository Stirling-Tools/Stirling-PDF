declare module '@stirling-pdf/shared-operations/src/wasm/pdfcpu/pdfcpu-wrapper-node.js' {
    export function oneToOne(wasmArray: string[], snapshot: Uint8Array): Promise<Uint8Array>;
}