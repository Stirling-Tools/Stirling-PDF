import { PdfFile, RepresentationType } from "../wrappers/PdfFile";

export type ImposeParamsType = {
    file: PdfFile;
    nup: number;
    format: string;
}
export type ImposeParamsBaseType = {
    file: PdfFile;
    nup: number;
    format: string;
    pdfcpuWrapper: any;
}
export async function impose(params: ImposeParamsBaseType): Promise<PdfFile> {
    const uint8Array = await params.pdfcpuWrapper.oneToOne(
        [
            "pdfcpu.wasm",
            "nup",
            "-c",
            "disable",
            'f:' + params.format,
            "/output.pdf",
            String(params.nup),
            "input.pdf",
        ],
        await params.file.uint8Array
    );

    const result = new PdfFile(
        params.file.originalFilename,
        uint8Array,
        RepresentationType.Uint8Array,
        params.file.filename + "_imposed"
    );
    
    console.log("ImposeResult: ", result);
    return result;
}