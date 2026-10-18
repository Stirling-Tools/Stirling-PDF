import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useCloudFilePickers } from "@editor/hooks/useCloudFilePickers";

const google = vi.hoisted(() => ({
  isEnabled: true,
  isLoading: false,
  error: null as string | null,
  clearError: vi.fn(),
  openPicker: vi.fn(async () => []),
}));
const oneDrive = vi.hoisted(() => ({
  isEnabled: true,
  isLoading: false,
  error: null as string | null,
  clearError: vi.fn(),
  openPicker: vi.fn(async () => []),
}));
vi.mock("@editor/hooks/useGoogleDrivePicker", () => ({
  useGoogleDrivePicker: () => google,
}));
vi.mock("@editor/hooks/useOneDrivePicker", () => ({
  useOneDrivePicker: () => oneDrive,
}));

beforeEach(() => {
  google.isEnabled = true;
  oneDrive.isEnabled = true;
  google.openPicker.mockClear();
});

it("lists only the services the server enabled, in a stable order", () => {
  oneDrive.isEnabled = false;
  const { result, rerender } = renderHook(useCloudFilePickers);
  expect(result.current.map((picker) => picker.id)).toEqual(["googledrive"]);

  oneDrive.isEnabled = true;
  rerender();
  expect(result.current.map((picker) => picker.id)).toEqual([
    "googledrive",
    "onedrive",
  ]);
  expect(result.current.map((picker) => picker.testId)).toEqual([
    "google-drive-button",
    "onedrive-button",
  ]);
});

it("passes one accept filter to whichever picker is opened", async () => {
  const { result } = renderHook(useCloudFilePickers);
  await result.current[0].openPicker({ multiple: false, accept: ".pdf" });
  expect(google.openPicker).toHaveBeenCalledWith({
    multiple: false,
    mimeTypes: ".pdf",
  });
});
