
import SharedOperations, { OperationsUseages } from "@stirling-pdf/shared-operations/src";

// Import injected libraries here!
//import * as pdfcpuWrapper from "@stirling-pdf/shared-operations/wasm/pdfcpu/pdfcpu-wrapper-node.js";

async function impose(snapshot: any, nup: number, format: string) {
    return SharedOperations.impose(snapshot, nup, format, null); // TODO change null to pdfcpuWrapper
}

const toExport: OperationsUseages = {
    ...SharedOperations,
    impose,
}
export default toExport;
