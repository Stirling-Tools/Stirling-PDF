import * as pdfcpuWraopper from "../wasm/pdfcpu-wrapper.js";

export function impose(snapshot, nup, format) {
    return pdfcpuWraopper.impose(snapshot, nup, format);
}