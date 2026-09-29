import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useGoogleDrivePicker } from "@app/hooks/useGoogleDrivePicker";
import { allowConsole } from "@app/tests/failOnConsole";

const service = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  openPicker: vi.fn(),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { googleDriveEnabled: true } }),
}));
vi.mock("@app/services/googleDrivePickerService", () => ({
  extractGoogleDriveBackendConfig: () => ({}),
  isGoogleDriveConfigured: () => true,
  getGoogleDriveConfig: () => ({}),
  getGoogleDrivePickerService: () => service,
}));

it("clears a failed Drive attempt and can retry without reinitializing the service", async () => {
  allowConsole.error(/Google Drive picker error/);
  const file = new File(["PDF"], "Drive.pdf");
  service.openPicker
    .mockRejectedValueOnce(new Error("Access denied"))
    .mockResolvedValueOnce([file]);
  const { result } = renderHook(useGoogleDrivePicker);
  await waitFor(() => expect(result.current.isEnabled).toBe(true));
  await act(async () => {
    expect(await result.current.openPicker()).toEqual([]);
  });
  expect(result.current.error).toBe("Access denied");
  expect(result.current.isLoading).toBe(false);
  act(() => result.current.clearError());
  expect(result.current.error).toBeNull();
  await act(async () => {
    expect(await result.current.openPicker()).toEqual([file]);
  });
  expect(service.initialize).toHaveBeenCalledOnce();
});
