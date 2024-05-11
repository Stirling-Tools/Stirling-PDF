import memfs from 'memfs';

globalThis.fs = memfs.fs;

import "./wasm_exec.js";

const encoder = new TextEncoder("utf-8");
const decoder = new TextDecoder("utf-8");
let outputBuf = "";

globalThis.fs.writeSyncOriginal = globalThis.fs.writeSync;
globalThis.fs.writeSync = function(fd, buf) {
    if (fd === 1 || fd === 2) {
        outputBuf += decoder.decode(buf);
        const nl = outputBuf.lastIndexOf("\n");
        if (nl != -1) {
            console.log(outputBuf.substr(0, nl));
            outputBuf = outputBuf.substr(nl + 1);
        }
        return buf.length;
    } else {
        return globalThis.fs.writeSyncOriginal(...arguments);
    }
};

globalThis.fs.writeOriginal = globalThis.fs.write;
globalThis.fs.write = function(fd, buf, offset, length, position, callback) {
    if (fd === 1 || fd === 2) {
        if (offset !== 0 || length !== buf.length || position !== null) {
            throw new Error("fs func not implemented");
        }
        const n = this.writeSync(fd, buf);
        callback(null, n, buf);
    } else {
        return globalThis.fs.writeOriginal(...arguments);
    }
};