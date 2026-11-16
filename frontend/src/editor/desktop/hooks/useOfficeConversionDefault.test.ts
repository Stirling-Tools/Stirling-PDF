import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useOfficeConversionDefault } from "@editor/hooks/useOfficeConversionDefault";

const state = vi.hoisted(() => ({
  local: false,
  cloud: true,
  saas: false,
  routed: false,
  localOnly: false,
}));
const remote = vi.hoisted(() => vi.fn());
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { stirlingOfficeConversion: state.local } }),
}));
vi.mock("@editor/hooks/useSaaSMode", () => ({ useSaaSMode: () => state.saas }));
vi.mock("@editor/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => state.localOnly,
}));
vi.mock("@editor/hooks/useToolCloudStatus", () => ({
  useToolCloudStatus: () => state.routed,
}));
vi.mock("@editor/hooks/useSaasAppConfig", () => ({
  useSaasAppConfig: (enabled: boolean) => {
    remote(enabled);
    return enabled ? { stirlingOfficeConversion: state.cloud } : null;
  },
}));

describe("desktop Office Convert default", () => {
  test.each([
    [false, false, false, false, true, "html-to-pdf", false, false],
    [false, false, false, true, false, "html-to-pdf", true, false],
    [true, false, false, true, false, "html-to-pdf", true, false],
    [true, true, false, false, true, "html-to-pdf", true, true],
    [true, true, false, true, false, "html-to-pdf", false, true],
    [true, true, true, false, true, "html-to-pdf", false, false],
    [true, false, false, false, true, undefined, true, true],
    [true, false, true, false, true, undefined, false, false],
  ] as const)(
    "saas=%s routed=%s localOnly=%s local=%s cloud=%s endpoint=%s",
    (saas, routed, localOnly, local, cloud, endpoint, expected, fetchCloud) => {
      Object.assign(state, { saas, routed, localOnly, local, cloud });
      remote.mockClear();
      const { result } = renderHook(() => useOfficeConversionDefault(endpoint));
      expect(result.current).toBe(expected);
      expect(remote).toHaveBeenLastCalledWith(fetchCloud);
    },
  );
});
