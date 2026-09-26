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

  it("replaces a fallback answer once a runner is registered", async () => {
    const file = blob();
    await expect(runEngineDocumentProbe(file)).resolves.toBeNull();

    registerEngineDocumentProbe(
      file,
      engine,
      async () => probeAnswer(3),
      async () => null,
    );
    resolveEngineDocumentOpen(file, "doc-late");
    await expect(runEngineDocumentProbe(file)).resolves.toEqual(probeAnswer(3));
  });

  it("drops the old document id when the engine changes", async () => {
    const file = blob();
    const probe = vi.fn(async () => probeAnswer(1));
    registerEngineDocumentProbe(file, engine, probe, async () => null);
    resolveEngineDocumentOpen(file, "doc-a");
    await expect(runEngineDocumentProbe(file)).resolves.toEqual(probeAnswer(1));

    const nextEngine = {};
    registerEngineDocumentProbe(file, nextEngine, probe, async () => null);
    // The previous engine's id must not reach the new runner.
    await expect(runEngineDocumentProbe(file)).resolves.toBeNull();

    beginEngineDocumentOpen(file);
    resolveEngineDocumentOpen(file, "doc-b");
    await expect(runEngineDocumentProbe(file)).resolves.toEqual(probeAnswer(1));
    expect(probe).toHaveBeenLastCalledWith("doc-b");
  });

  it("does not publish a keyed answer after an invalidation", async () => {
    const lastModified = 1_700_000_000_000;
    const makeFile = (label: string) =>
      new File([`%PDF-1.4 ${label}`], "same.pdf", {
        type: "application/pdf",
        lastModified,
      });
    const first = makeFile("same");
    const second = makeFile("same");
    const probe = vi.fn(async () => probeAnswer(1));
    registerEngineDocumentProbe(first, engine, probe, async () => null);
    resolveEngineDocumentOpen(first, "doc-a");
    await expect(runEngineDocumentProbe(first)).resolves.toEqual(
      probeAnswer(1),
    );

    invalidateEngineDocumentProbe(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // An equivalent file must not read the pre-invalidation answer.
    await expect(runEngineDocumentProbe(second)).resolves.toBeNull();
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
