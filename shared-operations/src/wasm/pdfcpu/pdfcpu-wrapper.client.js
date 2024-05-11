import "./wasm_exec_memfs.js";

import wasmUrl from '../../../public/wasm/pdfcpu/pdfcpu.wasm?url';

export async function oneToOne(wasmArray, snapshot) {
    if (!WebAssembly.instantiateStreaming) { // polyfill
        WebAssembly.instantiateStreaming = async (resp, importObject) => {
            const source = await (await resp).arrayBuffer();
            return await WebAssembly.instantiate(source, importObject);
        };
    }

    const go = new Go();
    go.argv = wasmArray;

    const webAssemblyInstantiatedSource = await WebAssembly.instantiateStreaming(fetch(wasmUrl), go.importObject);
    let inst = webAssemblyInstantiatedSource.instance

    await globalThis.fs.promises.writeFile("/input.pdf", Buffer.from(snapshot));

    await go.run(inst);
    inst = await WebAssembly.instantiate(webAssemblyInstantiatedSource.module, go.importObject); // reset instance

    globalThis.fs.promises.unlink("/input.pdf");
    const result = await globalThis.fs.promises.readFile("/output.pdf");

    globalThis.fs.promises.unlink("/output.pdf");
    
    return result;
}

export async function manyToOne() {
    //TODO: Do this of neccesary for some operations
}

export async function oneToMany() {
    //TODO: Do this of neccesary for some operations
}

export async function manyToMany() {
    //TODO: Do this of neccesary for some operations
}