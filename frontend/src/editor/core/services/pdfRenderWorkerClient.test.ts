import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A worker that cannot start in this page (blocked by a content security
// policy, say) must hand rendering back to the main thread for good; one that
// crashes after starting is replaced on the next request instead.

type Behaviour = "throw" | "fail-init" | "crash-on-render" | "ok";

const behaviours = vi.hoisted(() => [] as Behaviour[]);
const created = vi.hoisted(() => ({ count: 0 }));

vi.mock("@editor/workers/pdfRenderWorker?worker", () => ({
  default: class {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    private readonly behaviour: Behaviour;
    constructor() {
      this.behaviour = behaviours.shift() ?? "ok";
      if (this.behaviour === "throw") throw new Error("blocked by CSP");
      created.count++;
    }
    postMessage(message: { id: number; type: string }) {
      queueMicrotask(() => {
        if (
          (this.behaviour === "fail-init" && message.type === "init") ||
          (this.behaviour === "crash-on-render" && message.type !== "init")
        ) {
          this.onerror?.({ message: "worker died" });
          return;
        }
        this.onmessage?.({
          data: {
            id: message.id,
            ok: true,
            result:
              message.type === "init"
                ? undefined
                : {
                    pageCount: 1,
                    thumbnails: { rotated: "data:x" },
                    pageRotations: [0],
                    pageDimensions: [{ width: 1, height: 1 }],
                  },
          },
        });
      });
    }
    terminate() {}
  },
}));

vi.mock("@editor/services/wasmPrecompiler", () => ({
  pdfiumWasmModulePromise: Promise.resolve(null),
  pdfiumWasmUrl: "pdfium.wasm",
  startEagerWasmCompilation: () => {},
}));

vi.mock("@editor/services/pdfiumService", () => ({
  PdfiumOpenError: class extends Error {
    constructor(readonly code: number) {
      super(`open failed ${code}`);
    }
  },
}));

async function loadClient() {
  vi.resetModules();
  return import("@editor/services/pdfRenderWorkerClient");
}

const render = (client: Awaited<ReturnType<typeof loadClient>>) =>
  client.renderFirstPageInWorker(
    new Blob(["%PDF"]),
    "",
    1,
    {},
    ["rotated"],
    false,
  );

beforeEach(() => {
  behaviours.length = 0;
  created.count = 0;
  vi.stubGlobal("Worker", class {});
  vi.stubGlobal("OffscreenCanvas", class {});
});
afterEach(() => vi.unstubAllGlobals());

describe("pdf render worker client", () => {
  it("renders in the worker when it starts", async () => {
    const client = await loadClient();
    await expect(render(client)).resolves.toMatchObject({ pageCount: 1 });
    expect(client.canRenderInWorker()).toBe(true);
  });

  it("gives up on the worker when it cannot be constructed", async () => {
    behaviours.push("throw");
    const client = await loadClient();
    await expect(render(client)).rejects.toBeInstanceOf(
      client.RenderWorkerUnavailable,
    );
    expect(client.canRenderInWorker()).toBe(false);
  });

  it("gives up on the worker when it fails while starting", async () => {
    behaviours.push("fail-init");
    const client = await loadClient();
    await expect(render(client)).rejects.toBeInstanceOf(
      client.RenderWorkerUnavailable,
    );
    expect(client.canRenderInWorker()).toBe(false);
  });

  it("replaces a worker that crashes after starting", async () => {
    behaviours.push("crash-on-render", "ok");
    const client = await loadClient();
    const failed = await render(client).catch((e: unknown) => e);
    expect(failed).not.toBeInstanceOf(client.RenderWorkerUnavailable);
    expect(client.canRenderInWorker()).toBe(true);
    await expect(render(client)).resolves.toMatchObject({ pageCount: 1 });
    expect(created.count).toBe(2);
  });
});
