import { createRef } from "react";
import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  RedactionPendingTracker,
  type RedactionPendingTrackerAPI,
} from "@editor/components/viewer/RedactionPendingTracker";

const h = vi.hoisted(() => ({
  commit: vi.fn<() => Promise<boolean>>(),
  setPendingCount: vi.fn(),
}));

vi.mock("@editor/contexts/RedactionContext", () => ({
  useRedaction: () => ({ setPendingCount: h.setPendingCount }),
}));

vi.mock("@editor/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => "document",
}));
vi.mock("@embedpdf/plugin-redaction/react", () => ({
  useRedaction: () => ({
    state: { pendingCount: 1 },
    provides: { commitAllPending: () => ({ toPromise: h.commit }) },
  }),
}));

beforeEach(() => {
  h.commit.mockReset();
});

it("keeps save pending until the redaction task finishes", async () => {
  let finish!: (value: boolean) => void;
  h.commit.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const ref = createRef<RedactionPendingTrackerAPI>();
  render(<RedactionPendingTracker ref={ref} />);
  expect(ref.current?.getPendingCount()).toBe(1);
  let saved = false;
  const saving = ref.current!.commitAllPending().then(() => {
    saved = true;
  });
  await Promise.resolve();
  expect(saved).toBe(false);
  finish(true);
  await saving;
  expect(saved).toBe(true);
});

it("propagates failed redactions so Save & Leave can stop navigation", async () => {
  h.commit.mockRejectedValue(new Error("Could not redact document"));
  const ref = createRef<RedactionPendingTrackerAPI>();
  render(<RedactionPendingTracker ref={ref} />);
  await expect(ref.current!.commitAllPending()).rejects.toThrow(
    "Could not redact document",
  );
});
