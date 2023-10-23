export async function impose(snapshot, nup, format, pdfcpuWrapper) {
    return await pdfcpuWrapper.oneToOne([
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