import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useSaasAppConfig } from "@editor/hooks/useSaasAppConfig";

const api = vi.hoisted(() => ({
  getConfig: vi.fn(),
  clearCache: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("@editor/services/saasAppConfigService", () => ({
  saasAppConfigService: {
    getConfig: api.getConfig,
    clearCache: api.clearCache,
  },
}));
vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: { subscribeToModeChanges: api.subscribe },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.getConfig.mockResolvedValue({ stirlingOfficeConversion: true });
  api.subscribe.mockReturnValue(api.unsubscribe);
});

test("disabled consumers never fetch or subscribe, and stop listening when disabled again", async () => {
  const { result, rerender } = renderHook(
    ({ enabled }) => useSaasAppConfig(enabled),
    { initialProps: { enabled: false } },
  );
  expect(result.current).toBeNull();
  expect(api.getConfig).not.toHaveBeenCalled();
  expect(api.subscribe).not.toHaveBeenCalled();

  rerender({ enabled: true });
  await waitFor(() =>
    expect(result.current?.stirlingOfficeConversion).toBe(true),
  );
  expect(api.getConfig).toHaveBeenCalledTimes(1);
  expect(api.subscribe).toHaveBeenCalledTimes(1);

  rerender({ enabled: false });
  expect(result.current).toBeNull();
  expect(api.unsubscribe).toHaveBeenCalledTimes(1);
  expect(api.getConfig).toHaveBeenCalledTimes(1);
});

test("existing consumers without an enabled argument still load the cloud config", async () => {
  const { result } = renderHook(() => useSaasAppConfig());
  await waitFor(() =>
    expect(result.current?.stirlingOfficeConversion).toBe(true),
  );
  expect(api.getConfig).toHaveBeenCalledTimes(1);
});
