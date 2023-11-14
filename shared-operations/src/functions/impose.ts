
import { PdfFile, fromPdfLib } from '../wrappers/PdfFile';
export type ImposeParamsType = {
    file: any;
    nup: number;
    format: string;
}
export type ImposeParamsBaseType = {
    file: any;
    nup: number;
    format: string;
    pdfcpuWrapper: any;
}
export async function impose(params: ImposeParamsBaseType) {
    return await params.pdfcpuWrapper.oneToOne([
            "pdfcpu.wasm",
            "nup",
            "-c",
            "disable",
            'f:' + params.format,
            "/output.pdf",
            String(params.nup),
            "input.pdf",
        ], params.file);
}