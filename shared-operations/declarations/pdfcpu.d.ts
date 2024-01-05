declare module "#pdfcpu" {
    export function oneToOne(wasmArray: string[], snapshot: Uint8Array): Promise<Uint8Array>;
}