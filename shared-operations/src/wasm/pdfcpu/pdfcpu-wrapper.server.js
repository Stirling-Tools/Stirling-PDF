import "./wasm_exec_memfs.js";
import fs from "node:fs";

import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nodeWasmLocation = path.join(__dirname, "../../../public/wasm/pdfcpu/", "pdfcpu.wasm");

export async function oneToOne(wasmArray, snapshot) {
    const go = new Go();
    go.argv = wasmArray;

    const wasmFile = fs.readFileSync(nodeWasmLocation);
    const webAssemblyInstantiatedSource = await WebAssembly.instantiate(wasmFile, go.importObject);

    await globalThis.fs.promises.writeFile("/input.pdf", Buffer.from(snapshot));

    await go.run(webAssemblyInstantiatedSource.instance);

    globalThis.fs.promises.unlink("/input.pdf");

    const pdfcpu_result = await globalThis.fs.promises.readFile("/output.pdf");

    globalThis.fs.promises.unlink("/output.pdf");
    
    return new Uint8Array(pdfcpu_result);
}

export async function manyToOne() {
    //TODO: Do this if necessary for some pdfcpu operations
}

export async function oneToMany() {
    //TODO: Do this if necessary for some pdfcpu operations
}

export async function manyToMany() {
    //TODO: Do this if necessary for some pdfcpu operations
}