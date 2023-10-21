// TODO: Uses the BrowserFS import, needs to be changed for serverside

import { WasmFs } from '@wasmer/wasmfs';
import path from "path";

let webWasmLocation = "/wasm/";
let nodeWasmLocation = "./public/wasm/";

let fs;
const wasmfs = new WasmFs();

(async () => {
    await loadWasm();
    await configureFs();
})();

async function configureFs() {
    // Can't use BrowserFS: https://github.com/jvilk/BrowserFS/issues/271
    fs = wasmfs.fs; 
    global.fs = fs;

    console.log("InMemoryFs configured");
}

async function loadWasm() {
    global.crypto = (await import("crypto")).webcrypto; // wasm dependecy
    await import("./wasm_exec.js");
}

const runWasm = async (param) => {
    if (global.cachedWasmResponse === undefined) {
        const buffer = (await import("fs")).readFileSync(nodeWasmLocation + "/pdfcpu.wasm");
        global.cachedWasmResponse = buffer;
        global.go = new Go();
    }
    const { instance } = await WebAssembly.instantiate(
        global.cachedWasmResponse,
        global.go.importObject
    );
    global.go.argv = param;
    await global.go.run(instance);
    return global.go.exitCode;
};

async function loadFileAsync(data) {
    console.log(`Writing file to Disk`);
    fs.writeFileSync(`input.pdf`, data);
    console.log(`Write done. Validating...`);
    let exitcode = await runWasm([
        "pdfcpu.wasm",
        "validate",
        "-c",
        "disable",
        `input.pdf`,
    ]);
    if (exitcode !== 0)
        throw new Error("There was an error validating your PDFs");

    // // Get logs of command
    // wasmfs.getStdOut().then(response => {
    //     console.log(response);
    // });
    
    console.log(`File is Valid`);
}

export async function oneToOne(wasmArray, snapshot) {
    await loadFileAsync(Buffer.from(snapshot));

    console.log("Nuping File");

    let exitcode = await runWasm(wasmArray);
    if (exitcode !== 0) {
        console.error("There was an error nuping your PDFs");
        return;
    }
    console.log("Nuping Done");
    
    await checkExistsWithTimeout("/output.pdf", 1000);
    console.log("Write started...");

    // TODO: [Important] This fails for large PDFs. Need to a way to check if file write is definitely done.
    // We need to wait for the file write in memfs to finish in node for some reason
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, 1000);
    });
    console.log("Could be done?");

    fs.unlinkSync("input.pdf");

    const data = fs.readFileSync("/output.pdf"); 
    if(data.length == 0) {
        throw Error("File Size 0 that should not happen. The write probably didn't finish in time.");
    }
    fs.unlinkSync("output.pdf");
    console.log("Your File ist Ready!");
    return new Uint8Array(data);
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

// THX: https://stackoverflow.com/questions/26165725/nodejs-check-file-exists-if-not-wait-till-it-exist
function checkExistsWithTimeout(filePath, timeout) {
    return new Promise(function (resolve, reject) {

        var timer = setTimeout(function () {
            watcher.close();
            reject(new Error('File did not exists and was not created during the timeout.'));
        }, timeout);

        fs.access(filePath, fs.constants.R_OK, function (err) {
            if (!err) {
                clearTimeout(timer);
                watcher.close();
                resolve();
            }
        });

        var dir = path.dirname(filePath);
        var watcher = fs.watch(dir, function (eventType, filename) {
            clearTimeout(timer);
            watcher.close();
            resolve();
        });
    });
}