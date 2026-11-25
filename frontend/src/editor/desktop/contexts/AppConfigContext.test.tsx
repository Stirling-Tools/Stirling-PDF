import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  localOnly: true,
  bundledHardware: false,
  listeners: new Set<() => void>(),
}));
vi.mock("@editor/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => state.localOnly,
}));
vi.mock("@editor/services/tauriBackendService", () => ({
  tauriBackendService: {
    isHardwareSigningAvailable: () => state.bundledHardware,
    subscribeToStatus: (listener: () => void) => {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
  },
}));
vi.mock("@editor-core/contexts/AppConfigContext", () => ({
  AppConfigProvider: () => null,
  useAppConfig: () => ({
    config: {
      storageEnabled: true,
      storageSharingEnabled: true,
      storageShareLinksEnabled: true,
      storageGroupSigningEnabled: true,
      aiEngineEnabled: true,
      enableMobileScanner: true,
      enableMobileSignature: true,
      premiumEnabled: true,
      // A connected server reports false: it runs outside the user's session.
      hardwareSigningAvailable: false,
    },
  }),
}));
import { useAppConfig } from "@editor/contexts/AppConfigContext";

beforeEach(() => {
  state.localOnly = true;
  state.bundledHardware = false;
  state.listeners.clear();
});

test("managed privacy overrides server document features while preserving account capabilities", () => {
  state.localOnly = true;
  const { result, rerender } = renderHook(useAppConfig);
  expect(result.current.config).toMatchObject({
    storageEnabled: false,
    storageSharingEnabled: false,
    storageShareLinksEnabled: false,
    storageGroupSigningEnabled: false,
    aiEngineEnabled: false,
    enableMobileScanner: false,
    enableMobileSignature: false,
    premiumEnabled: true,
  });
  state.localOnly = false;
  rerender();
  expect(result.current.config?.storageEnabled).toBe(true);
  expect(result.current.config?.storageGroupSigningEnabled).toBe(true);
});

test.each([true, false])(
  "hardware signing follows the bundled backend, not the connected server (local only: %s)",
  (localOnly) => {
    state.localOnly = localOnly;
    const { result } = renderHook(useAppConfig);
    expect(result.current.config?.hardwareSigningAvailable).toBe(false);

    state.bundledHardware = true;
    act(() => state.listeners.forEach((listener) => listener()));
    expect(result.current.config?.hardwareSigningAvailable).toBe(true);
  },
);
