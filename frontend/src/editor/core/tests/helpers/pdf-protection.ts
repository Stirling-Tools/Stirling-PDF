import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { init } from "@embedpdf/pdfium";
import { readEncryptionDictionary } from "@editor/tests/helpers/pdf-encryption";
import type { Page } from "@playwright/test";
import { liveApiHeaders } from "@editor/tests/helpers/live-api";

const require = createRequire(import.meta.url);
const modulePromise = readFile(
  require.resolve("@embedpdf/pdfium/pdfium.wasm"),
).then(async (wasmBinary) => {
  const module = await init({ wasmBinary });
  module.PDFiumExt_Init();
  return module;
});

/** Opens result bytes in PDFium; invalid credentials reject without making an API request. */
export async function readPdfProtection(buffer: Buffer, password = "") {
  const module = await modulePromise;
  const pointer = module.pdfium.wasmExports.malloc(buffer.length);
  const runtime = module.pdfium as typeof module.pdfium & {
    HEAPU8: Uint8Array;
  };
  runtime.HEAPU8.set(buffer, pointer);
  let document = 0;
  try {
    document = module.FPDF_LoadMemDocument(pointer, buffer.length, password);
    if (!document)
      throw new Error(`PDF open failed: ${module.FPDF_GetLastError()}`);
    const encrypted = module.EPDF_IsEncrypted(document);
    const ownerAuthenticated =
      encrypted && module.EPDF_IsOwnerUnlocked(document);
    const permissions = module.FPDF_GetDocUserPermissions(document);
    const encryptionRevision = module.FPDF_GetSecurityHandlerRevision(document);
    const empty = module.FPDF_LoadMemDocument(pointer, buffer.length, "");
    const requiresOpeningPassword = !empty;
    if (empty) module.FPDF_CloseDocument(empty);
    const allows = (flag: number) =>
      !encrypted || ownerAuthenticated || (permissions & flag) !== 0;
    return {
      encrypted,
      ownerAuthenticated,
      permissions,
      encryptionRevision,
      credentialEntries: await readEncryptionDictionary(buffer),
      requiresOpeningPassword,
      signed: module.FPDF_GetSignatureCount(document) > 0,
      pageCount: module.FPDF_GetPageCount(document),
      canModify: allows(8),
      canPrint: allows(4),
      canExtract: allows(16),
      canAssemble: allows(encryptionRevision === 2 ? 8 : 1024),
      canPrintFaithful: allows(encryptionRevision === 2 ? 4 : 2048),
    };
  } finally {
    if (document) module.FPDF_CloseDocument(document);
    module.pdfium.wasmExports.free(pointer);
  }
}

/** Combines local PDF facts with the running instance's policy for live workflow assertions. */
export async function inspectPdfProtection(
  page: Page,
  buffer: Buffer,
  password = "",
) {
  const access = await readPdfProtection(buffer, password);
  const config = await page.request.get("/api/v1/config/app-config", {
    headers: await liveApiHeaders(page),
  });
  if (!config.ok())
    throw new Error(`App config returned HTTP ${config.status()}`);
  return {
    ...access,
    honorOwnerPasswords: (await config.json()).honorOwnerPasswords as
      | boolean
      | undefined,
  };
}
