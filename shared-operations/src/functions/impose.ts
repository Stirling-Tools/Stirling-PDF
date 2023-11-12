export async function impose(snapshot: any, nup: number, format: string, pdfcpuWrapper: any) {
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