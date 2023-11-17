
import SharedOperations, { OperationsType } from "@stirling-pdf/shared-operations/src"
import { ImposeParamsType } from '@stirling-pdf/shared-operations/src/functions/impose'
import { PdfFile } from "@stirling-pdf/shared-operations/src/wrappers/PdfFile"

// Import injected libraries here!
import * as pdfcpuWrapper from "@stirling-pdf/shared-operations/src/wasm/pdfcpu/pdfcpu-wrapper-node.js";

async function impose(params: ImposeParamsType): Promise<PdfFile> {
    return SharedOperations.impose(params, pdfcpuWrapper);
}

const toExport: OperationsType = {
    ...SharedOperations,
    impose,
}
export default toExport;
