/**
 * Pins the keyed-publish race: a probe that resolves its content key after an
 * invalidation must not repopulate the keyed cache with the stale answer.
 */
import { describe, expect, it, vi } from "vitest";

let keyCalls = 0;
let deferredCall = -1;
let deferredResolve: ((key: string | null) => void) | null = null;

vi.mock("@app/services/documentBytesCache", () => ({
  documentFileKey: vi.fn(async () => {
    keyCalls += 1;
    if (keyCalls === deferredCall) {
      return new Promise<string | null>((resolve) => {
        deferredResolve = resolve;
      });
    }
    return "shared-key";
  }),
}));

import {
  invalidateEngineDocumentProbe,
  registerEngineDocumentProbe,
  resolveEngineDocumentOpen,
  runEngineDocumentProbe,
} from "@app/services/documentProbeEngine";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const answer = { formType: 1, attachmentCount: 0 };

describe("documentProbeEngine keyed publishes", () => {
  it("does not publish a keyed answer after an invalidation", async () => {
    const file = new File(["%PDF"], "same.pdf", { type: "application/pdf" });
    const equivalent = new File(["%PDF"], "same.pdf", {
      type: "application/pdf",
    });
    registerEngineDocumentProbe(
      file,
      {},
      async () => answer,
      async () => null,
    );
    resolveEngineDocumentOpen(file, "doc-a");
    await flush();

    // The probe's own key lookup resolves, its publish lookup stays pending.
    keyCalls = 0;
    deferredCall = 2;
    const probe = runEngineDocumentProbe(file);
    await expect(probe).resolves.toEqual(answer);
    await flush();

    invalidateEngineDocumentProbe(file);
    await flush();
    deferredResolve?.("shared-key");
    await flush();

    // The stale answer must not resurface for an equivalent file.
    await expect(runEngineDocumentProbe(equivalent)).resolves.toBeNull();
  });
});
