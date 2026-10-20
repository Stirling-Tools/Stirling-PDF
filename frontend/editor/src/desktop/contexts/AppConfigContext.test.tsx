import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ localOnly: true }));
vi.mock("@app/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => state.localOnly,
}));
vi.mock("@core/contexts/AppConfigContext", () => ({
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
    },
  }),
}));
import { useAppConfig } from "@app/contexts/AppConfigContext";

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
