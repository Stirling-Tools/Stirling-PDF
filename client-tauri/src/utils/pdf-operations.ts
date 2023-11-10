
import SharedOperations from '@stirling-pdf/shared-operations'
import * as pdfcpuWrapper from "@stirling-pdf/shared-operations/wasm/pdfcpu/pdfcpu-wrapper-browser.js";

async function impose(snapshot: any, nup: number, format: string) {
    return SharedOperations.impose(snapshot, nup, format, pdfcpuWrapper)
}

export default {
    ...SharedOperations,
    impose,
}
