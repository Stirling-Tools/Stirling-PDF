import { PdfErrorCode } from "@embedpdf/models";
import type { PdfDocumentObject, PdfEngine, PdfFile } from "@embedpdf/models";
import {
  pdfiumWasmUrl,
  startEagerWasmCompilation,
} from "@app/services/wasmPrecompiler";

/**
 * Session access derived from the file's own bytes, read locally by PDFium.
 *
 * Replaces the empty-password /inspect-pdf-security round trip so access is
 * known as soon as a file is opened. One worker engine is shared app-wide,
 * probes are serialized (the slot is taken before the bytes are read) and
 * results are cached per blob; any failure settles as `null` - unknown, never
 * "unrestricted" - and is not cached, so a retry can recover.
 *
 * Known SDK limits, kept out of the probe on purpose: openDocumentBuffer is a
 * full document open (bytes are copied into the wasm heap and every page is
 * enumerated), getSignatures builds every signature object, and the engine
 * exposes no security-handler revision (FPDF_GetSecurityHandlerRevision exists
 * in PDFium). The concrete upstream fix for all three is a worker-side
 * security-inspection operation returning only encryption state, auth role,
 * raw user permissions, revision, page count and signature count. Unreadable
 * signature state must never be reported as "unsigned": a failed read settles
 * as unknown instead.
 *
 * EmbedPDF 3.0 removes this module: documents opened through the
 * document-manager carry a permissions config and useDocumentPermissions()
 * from '@embedpdf/core/react' exposes the effective flags.
 */
export interface PdfPermissionSnapshot {
  encrypted: boolean;
  requiresOpeningPassword: boolean;
  /** Stored user-level restrictions (FPDF_GetDocUserPermissions), signed 32-bit. */
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

const ENGINE_START_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 3_000;

let probeEngine: Promise<PdfEngine<Blob>> | null = null;
const snapshots = new WeakMap<Blob, PdfPermissionSnapshot>();
const inFlight = new WeakMap<Blob, Promise<PdfPermissionSnapshot | null>>();
let probeSequence = 0;

class ProbeTimeoutError extends Error {}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new ProbeTimeoutError(message)),
      ms,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function destroyEngine(engine: PdfEngine<Blob>): Promise<void> {
  try {
    const destroying = engine.destroy?.();
    await destroying?.toPromise();
  } catch {
    /* The worker is being thrown away either way. */
  }
}

/** Drop the current engine generation; a start that lands late is destroyed. */
function invalidateProbeEngine(): void {
  const engine = probeEngine;
  probeEngine = null;
  void engine?.then(
    (started) => destroyEngine(started),
    () => undefined,
  );
}

function startProbeEngine(): Promise<PdfEngine<Blob>> {
  startEagerWasmCompilation();
  return import("@embedpdf/engines/pdfium-worker-engine").then(
    ({ createPdfiumEngine }) => createPdfiumEngine(pdfiumWasmUrl),
  );
}

function getProbeEngine(): Promise<PdfEngine<Blob>> {
  if (probeEngine) return probeEngine;
  const raw = startProbeEngine();
  const started = withTimeout(
    raw,
    ENGINE_START_TIMEOUT_MS,
    "PDF permission engine start timed out",
  );
  probeEngine = started;
  void raw
    .then((engine) => {
      if (probeEngine !== started) void destroyEngine(engine);
    })
    .catch(() => undefined);
  void started.catch(() => {
    if (probeEngine === started) probeEngine = null;
  });
  return started;
}

// Probes run one at a time: each lifecycle waits for the previous one to
// settle, so batch uploads cannot stack reads, opens or wasm heap pressure.
let probeQueue: Promise<void> = Promise.resolve();

function enqueueProbe<T>(task: () => Promise<T>): Promise<T> {
  const run = probeQueue.then(task, task);
  probeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runProbeOnce(file: Blob): Promise<PdfPermissionSnapshot> {
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
    )
      return passwordRequiredSnapshot;
    throw error;
  }
  try {
    const [permissions, signatures] = await Promise.all([
      // User-level restrictions are the stored protection the server also
      // reports; the effective mask would read as "all allowed" once the
      // owner password has been supplied, which preservation compares cannot
      // use.
      engine.getDocUserPermissions(document).toPromise(),
      engine.getSignatures(document).toPromise(),
    ]);
    return {
      encrypted: document.isEncrypted,
      requiresOpeningPassword: false,
      // PDFium reports the unsigned 32-bit mask while the server sends the
      // signed PDFBox value, so normalize to signed once, at this boundary.
      permissions: Number(permissions) | 0,
      ownerAuthenticated: document.isOwnerUnlocked,
      pageCount: document.pageCount,
      signed: (signatures ?? []).length > 0,
    };
  } finally {
    try {
      await withTimeout(
        engine.closeDocument(document).toPromise(),
        CLOSE_TIMEOUT_MS,
        "PDF permission probe close timed out",
      );
    } catch {
      // A document that will not close means the worker cannot be trusted
      // with further probes; drop the whole generation.
      invalidateProbeEngine();
    }
  }
}

export function probePdfPermissions(
  file: Blob,
): Promise<PdfPermissionSnapshot | null> {
  const cached = snapshots.get(file);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(file);
  if (pending) return pending;
  const probe = enqueueProbe(() =>
    withTimeout(
      runProbeOnce(file),
      PROBE_TIMEOUT_MS,
      "PDF permission probe timed out",
    ).catch((error: unknown) => {
      // A wedged engine cannot serve later probes either; drop it so the
      // next attempt starts a fresh worker.
      if (error instanceof ProbeTimeoutError) invalidateProbeEngine();
      return null;
    }),
  ).then((snapshot) => {
    // Failures are not cached: a retry may succeed after a transient engine
    // or transport problem.
    if (snapshot) snapshots.set(file, snapshot);
    inFlight.delete(file);
    return snapshot;
  });
  inFlight.set(file, probe);
  return probe;
}

/** Facts already read for these bytes, used to recompute policy-derived access without reopening. */
export function getProbeSnapshot(
  file: Blob,
): PdfPermissionSnapshot | undefined {
  return snapshots.get(file);
}
