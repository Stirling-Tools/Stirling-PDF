import { describe, expect, it } from "vitest";
import {
  dispatchFormApply,
  FORM_APPLY_EVENT,
  type FormApplyDetail,
} from "@editor/tools/formFill/formFillEvents";

describe("form save handoff", () => {
  it("rejects when no viewer can accept the save", async () => {
    await expect(dispatchFormApply(new Blob())).rejects.toThrow("not ready");
  });

  it("waits for replacement and field refresh", async () => {
    let finish!: () => void;
    const applied = new Promise<void>((resolve) => {
      finish = resolve;
    });
    window.addEventListener(
      FORM_APPLY_EVENT,
      (event) => {
        (event as CustomEvent<FormApplyDetail>).detail.complete(applied);
      },
      { once: true },
    );
    let completed = false;
    const saved = dispatchFormApply(new Blob()).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    finish();
    await saved;
    expect(completed).toBe(true);
  });

  it("propagates persistence failures to the save surface", async () => {
    window.addEventListener(
      FORM_APPLY_EVENT,
      (event) => {
        (event as CustomEvent<FormApplyDetail>).detail.complete(
          Promise.reject(new Error("Storage failed")),
        );
      },
      { once: true },
    );
    await expect(dispatchFormApply(new Blob())).rejects.toThrow(
      "Storage failed",
    );
  });
});
