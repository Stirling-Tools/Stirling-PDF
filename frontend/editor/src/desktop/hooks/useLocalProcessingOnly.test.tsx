import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  cached: undefined as boolean | undefined,
  load: vi.fn(),
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedLocalProcessingOnly: () => state.cached,
    getCurrentConfig: state.load,
    subscribeToModeChanges: () => () => {},
  },
}));
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";

beforeEach(() => {
  state.cached = undefined;
  state.load.mockReset();
});

test("keeps off-device features hidden until provisioning resolves", async () => {
  let resolve!: (config: { local_processing_only: boolean }) => void;
  state.load.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result } = renderHook(useLocalProcessingOnly);
  expect(result.current).toBe(true);
  await act(async () => resolve({ local_processing_only: false }));
  expect(result.current).toBe(false);
});

test("a policy read failure never grants off-device processing", async () => {
  state.load.mockRejectedValue(new Error("Native store unavailable"));
  const { result } = renderHook(useLocalProcessingOnly);
  await act(async () => {});
  expect(result.current).toBe(true);
});
