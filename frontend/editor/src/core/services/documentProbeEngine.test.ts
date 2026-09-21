/**
 * Contract for the engine document probe registry: callers wait for the engine
 * document id, a failed answer is retried after a reopen, and the layer verdict
 * can say "cannot decide" so the caller parses instead.
 */
import { describe, expect, it, vi } from "vitest";
import {
  beginEngineDocumentOpen,
  invalidateEngineDocumentProbe,
  registerEngineDocumentProbe,
  resolveEngineDocumentOpen,
  runEngineDocumentLayerVerdict,
  runEngineDocumentProbe,
} from "@app/services/documentProbeEngine";

let sequence = 0;
const blob = () => {
  sequence += 1;
  return new Blob([`%PDF-1.4 probe ${sequence}`], { type: "application/pdf" });
};
const engine = {};

const probeAnswer = (formType: number) => ({ formType, attachmentCount: 0 });

describe("documentProbeEngine", () => {
  it("returns null when nothing is registered", async () => {
    await expect(runEngineDocumentProbe(blob())).resolves.toBeNull();
    await expect(runEngineDocumentLayerVerdict(blob())).resolves.toBeNull();
  });

  it("waits for the document id before asking the worker", async () => {
    const file = blob();
    const probe = vi.fn(async () => probeAnswer(1));
    beginEngineDocumentOpen(file);
    registerEngineDocumentProbe(file, engine, probe, async () => null);

    const pending = runEngineDocumentProbe(file);
    expect(probe).not.toHaveBeenCalled();
    resolveEngineDocumentOpen(file, "doc-1");

    await expect(pending).resolves.toEqual(probeAnswer(1));
    expect(probe).toHaveBeenCalledWith("doc-1");
  });

  it("answers null and stays retryable when no document id arrives", async () => {
    const file = blob();
    const probe = vi.fn(async () => probeAnswer(0));
    beginEngineDocumentOpen(file);
    registerEngineDocumentProbe(file, engine, probe, async () => null);

    const pending = runEngineDocumentProbe(file);
    resolveEngineDocumentOpen(file, null);
    await expect(pending).resolves.toBeNull();

    // A later open resolves an id; the memoized null must not block the retry.
    invalidateEngineDocumentProbe(file);
    beginEngineDocumentOpen(file);
    resolveEngineDocumentOpen(file, "doc-2");
    await expect(runEngineDocumentProbe(file)).resolves.toEqual(probeAnswer(0));
    expect(probe).toHaveBeenCalledWith("doc-2");
  });

  it("retries after a failed probe once the document is reopened", async () => {
    const file = blob();
    const probe = vi
      .fn<(documentId: string) => Promise<ReturnType<typeof probeAnswer>>>()
      .mockRejectedValueOnce(new Error("worker gone"))
      .mockResolvedValueOnce(probeAnswer(2));
    registerEngineDocumentProbe(file, engine, probe, async () => null);
    resolveEngineDocumentOpen(file, "doc-1");

    await expect(runEngineDocumentProbe(file)).resolves.toBeNull();

    invalidateEngineDocumentProbe(file);
    resolveEngineDocumentOpen(file, "doc-2");
    await expect(runEngineDocumentProbe(file)).resolves.toEqual(probeAnswer(2));
  });

  it("passes the layer verdict through, including cannot-decide", async () => {
    const decided = blob();
    registerEngineDocumentProbe(
      decided,
      engine,
      async () => probeAnswer(0),
      async () => false,
    );
    resolveEngineDocumentOpen(decided, "doc-a");
    await expect(runEngineDocumentLayerVerdict(decided)).resolves.toBe(false);

    const unknown = blob();
    registerEngineDocumentProbe(
      unknown,
      engine,
      async () => probeAnswer(0),
      async () => null,
    );
    resolveEngineDocumentOpen(unknown, "doc-b");
    await expect(runEngineDocumentLayerVerdict(unknown)).resolves.toBeNull();
  });
});
