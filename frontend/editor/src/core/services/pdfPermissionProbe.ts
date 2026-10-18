import { PdfErrorCode } from "@embedpdf/models";
import type { PdfDocumentObject, PdfEngine, PdfFile } from "@embedpdf/models";
import {
  pdfiumWasmUrl,
  startEagerWasmCompilation,
} from "@app/services/wasmPrecompiler";

/** Encryption facts read from the file's own bytes; no server round trip. */
export interface PdfPermissionSnapshot {
  encrypted: boolean;
  requiresOpeningPassword: boolean;
  permissions: number;
  ownerAuthenticated: boolean;
  pageCount: number;
  signed: boolean;
}

const passwordRequiredSnapshot: PdfPermissionSnapshot = {
  encrypted: true,
  requiresOpeningPassword: true,
  permissions: 0,
  ownerAuthenticated: false,
  pageCount: 0,
  signed: false,
};

let probeEngine: Promise<PdfEngine<Blob>> | null = null;
const snapshots = new WeakMap<Blob, PdfPermissionSnapshot | null>();
const inFlight = new WeakMap<Blob, Promise<PdfPermissionSnapshot | null>>();
let probeSequence = 0;

/** The engine outlives every probe; a failed start is retried on the next call. */
function getProbeEngine(): Promise<PdfEngine<Blob>> {
  probeEngine ??= (async () => {
    startEagerWasmCompilation();
    const { createPdfiumEngine } =
      await import("@embedpdf/engines/pdfium-worker-engine");
    return createPdfiumEngine(pdfiumWasmUrl);
  })().catch((error: unknown) => {
    probeEngine = null;
    throw error;
  });
  return probeEngine;
}

async function runProbe(file: Blob): Promise<PdfPermissionSnapshot | null> {
  const engine = await getProbeEngine();
  const content = await file.arrayBuffer();
  const pdf: PdfFile = {
    id: `pdf-permission-probe-${++probeSequence}`,
    content,
  };
  let document: PdfDocumentObject;
  try {
    document = await engine
      .openDocumentBuffer(pdf, { password: "" })
      .toPromise();
  } catch (error) {
    if (
      (error as { code?: PdfErrorCode } | null)?.code === PdfErrorCode.Password
    ) {
      return passwordRequiredSnapshot;
    }
    throw error;
  }
  try {
    const [permissions, signatures] = await Promise.all([
      typeof document.permissions === "number"
        ? document.permissions
        : engine.getDocPermissions(document).toPromise(),
      engine.getSignatures(document).toPromise(),
    ]);
    return {
      encrypted: document.isEncrypted,
      requiresOpeningPassword: false,
      permissions,
      ownerAuthenticated: document.isOwnerUnlocked,
      pageCount: document.pageCount,
      signed: (signatures ?? []).length > 0,
    };
  } finally {
    // Closing only releases the handle; a failure here must not fail the probe.
    void engine
      .closeDocument(document)
      .toPromise()
      .catch(() => {});
  }
}

/**
 * Reads encryption state and permission bits locally with the bundled PDFium
 * build, replacing the empty-password /inspect-pdf-security round trip that
 * left session access undefined while it was in flight.
 *
 * One transfer of the file's bytes and one document open per blob; the result
 * (including "needs a password" and "cannot be read") is cached, and concurrent
 * callers share a single open. Never rejects.
 *
 * EmbedPDF 3.0 removes the need for this module: documents opened through the
 * document-manager carry a permissions config and useDocumentPermissions()
 * from '@embedpdf/core/react' exposes the same effective flags.
 */
export function probePdfPermissions(
  file: Blob,
): Promise<PdfPermissionSnapshot | null> {
  if (snapshots.has(file)) return Promise.resolve(snapshots.get(file) ?? null);
  const pending = inFlight.get(file);
  if (pending) return pending;
  const probe = runProbe(file)
    .catch(() => null)
    .then((snapshot) => {
      snapshots.set(file, snapshot);
      inFlight.delete(file);
      return snapshot;
    });
  inFlight.set(file, probe);
  return probe;
}
