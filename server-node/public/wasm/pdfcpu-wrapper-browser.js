let wasmLocation = "/wasm/";

let fs;
let Buffer;

configureFs();
loadWasm();

async function configureFs() {
    BrowserFS.configure(
        {
            fs: "InMemory",
        },
        function (e) {
            if (e) {
                // An error happened!
                throw e;
            }
            fs = BrowserFS.BFSRequire("fs");
            Buffer = BrowserFS.BFSRequire("buffer").Buffer;

            window.fs = fs;
            window.Buffer = Buffer;
        }
    );
}

function loadWasm() {
    import("../../../server-node/public/wasm/wasm_exec.js");
}

const runWasm = async (param) => {
    if (window.cachedWasmResponse === undefined) {
        const response = await fetch(wasmLocation + "/pdfcpu.wasm");
        const buffer = await response.arrayBuffer();
        window.cachedWasmResponse = buffer;
        window.go = new Go();
    }
    const { instance } = await WebAssembly.instantiate(
        window.cachedWasmResponse,
        window.go.importObject
    );
    window.go.argv = param;
    await window.go.run(instance);
    return window.go.exitCode;
};

async function loadFileAsync(data) {
    console.log(`Writing file to MemoryFS`);
    await fs.writeFile(`/input.pdf`, data);
    console.log(`Write done. Validating...`);
    let exitcode = await runWasm([
        "pdfcpu.wasm",
        "validate",
        "-c",
        "disable",
        `/input.pdf`,
    ]);

    if (exitcode !== 0)
        throw new Error("There was an error validating your PDFs");

    console.log(`File is Valid`);
}

export async function impose(snapshot, nup, format) {
    
};

export async function oneToOne(wasmArray, snapshot) {
    await loadFileAsync(Buffer.from(snapshot));

    console.log("Nuping File");
    let exitcode = await runWasm(wasmArray);

    if (exitcode !== 0) {
        console.error("There was an error nuping your PDFs");
        return;
    }

    await fs.unlink("input.pdf");
    const contents = fs.readFileSync("output.pdf");
    fs.unlink("output.pdf");
    console.log("Your File ist Ready!");
    return new Uint8Array(contents);
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