import * as pdfcpuWraopper from "../public/wasm/pdfcpu-wrapper-node.js";

export async function impose(snapshot, nup, format) {
    return await pdfcpuWraopper.oneToOne([
            "pdfcpu.wasm",
            "nup",
            "-c",
            "disable",
            'f:' + format,
            "/output.pdf",
            String(nup),
            "input.pdf",
        ], snapshot);
}

