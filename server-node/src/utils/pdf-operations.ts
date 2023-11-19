
import SharedOperations, { OperatorsType, OperatorParametersType } from "@stirling-pdf/shared-operations/src"
import { PdfFile } from "@stirling-pdf/shared-operations/src/wrappers/PdfFile"

// Import injected libraries here!
import * as pdfcpuWrapper from "@stirling-pdf/shared-operations/src/wasm/pdfcpu/pdfcpu-wrapper-node.js";

async function impose(params: OperatorParametersType["Impose"]): Promise<PdfFile> {
    return SharedOperations.Impose.exec(params, pdfcpuWrapper);
}

const toExport: OperatorsType = {
    ...SharedOperations,
    Impose: {exec: impose, spec: SharedOperations.Impose.spec},
}
export default toExport;
