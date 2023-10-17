// TODO: Uses the BrowserFS import, needs to be changed for serverside

let wasmLocation = "/wasm/";

let fs;
let Buffer;

configureFs();
loadWasm();

function configureFs() {
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

            // TODO: Find a way to remove these globals:
            window.fs = fs;
            window.Buffer = Buffer;
        }
    );
}

// TODO: This needs to be changed in order to run on node
function loadWasm() {
    const script = document.createElement("script");
    script.src = wasmLocation + "/wasm_exec.js";
    script.async = true;
    document.body.appendChild(script);
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
    let exitCode = await runWasm([
        "pdfcpu.wasm",
        "validate",
        "-c",
        "disable",
        `/input.pdf`,
    ]);

    if (exitCode !== 0)
        throw new Error("There was an error validating your PDFs");
}

export async function impose(snapshot, nup, format) {
    await loadFileAsync(Buffer.from(snapshot));

    let exitcode = await runWasm([
        "pdfcpu.wasm",
        "nup",
        "-c",
        "disable",
        'f:' + format,
        "output.pdf",
        String(nup),
        "input.pdf",
    ]);

    if (exitcode !== 0) {
        console.error("There was an error nuping your PDFs");
        return;
    }

    await fs.unlink("input.pdf");
    const contents = fs.readFileSync("output.pdf");
    fs.unlink("output.pdf");
    console.log("Your File ist Ready!");
    return new Uint8Array(contents);
};