export async function impose(snapshot, nup, format, pdfcpuWraopper) {
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