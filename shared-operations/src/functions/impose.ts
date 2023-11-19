import { PdfFile, RepresentationType } from "../wrappers/PdfFile";
import { FieldConstraint, RecordConstraint } from '../dynamic-ui/OperatorConstraints'

export type ImposeParamsType = {
    file: PdfFile;
    /** Accepted values are 2, 3, 4, 8, 9, 12, 16 - see: {@link https://pdfcpu.io/generate/nup.html#n-up-value} */
    nup: 2 | 3 | 4 | 8 | 9 | 12 | 16;
    /** A0-A10, other formats available - see: {@link https://pdfcpu.io/paper.html} */
    format: string;
}

export const ImposeParamConstraints = new RecordConstraint({
    file: new FieldConstraint("display", "file.pdf", true, "hint"),
    nup: new FieldConstraint("display", [2, 3, 4, 8, 9, 12, 16], true, "hint"),
    format: new FieldConstraint("display", "string", true, "hint"),
})

/** PDF-Imposition, PDF-N-Up: Put multiple pages of the input document into a single page of the output document. - see: {@link https://en.wikipedia.org/wiki/N-up}  */
export async function impose(params: ImposeParamsType, pdfcpuWrapper: any): Promise<PdfFile> {
    // https://pdfcpu.io/generate/nup.html
    const uint8Array = await pdfcpuWrapper.oneToOne(
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
