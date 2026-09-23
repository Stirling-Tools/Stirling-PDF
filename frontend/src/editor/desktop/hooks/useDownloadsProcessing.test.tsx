import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useDownloadsProcessing } from "@app/hooks/useDownloadsProcessing";
import {
  claimRun,
  endClassificationDemo,
  useClassificationDemoSession,
} from "@app/components/onboarding/classificationDemo/classificationDemoSession";
import { resolveDownloadsDirectory } from "@app/components/onboarding/classificationDemo/classificationDemoSweep";
import { readDir } from "@tauri-apps/plugin-fs";

vi.mock("@tauri-apps/plugin-fs", () => ({ readDir: vi.fn() }));

vi.mock(
  "@app/components/onboarding/classificationDemo/classificationDemoSweep",
  () => ({
    CLASSIFICATION_DEMO_BATCH_SIZE: 10,
    resolveDownloadsDirectory: vi.fn(),
  }),
);

it("offers Downloads only when readable and before its first run", async () => {
  localStorage.clear();
  localStorage.setItem("stirling-desktop-classification-demo-seen", "true");
  vi.mocked(resolveDownloadsDirectory).mockResolvedValueOnce(null);
  const unavailable = renderHook(useDownloadsProcessing);
  await act(async () => {});
  expect(unavailable.result.current).toBeNull();
  unavailable.unmount();
  expect(readDir).not.toHaveBeenCalled();

  vi.mocked(resolveDownloadsDirectory).mockResolvedValue("C:/Downloads");
  vi.mocked(readDir).mockRejectedValueOnce(new Error("Access denied"));
  const denied = renderHook(useDownloadsProcessing);
  await act(async () => {});
  expect(readDir).toHaveBeenCalledWith("C:/Downloads");
  expect(denied.result.current).toBeNull();
  denied.unmount();

  vi.mocked(readDir).mockResolvedValue([]);
  const offer = renderHook(() => ({
    downloads: useDownloadsProcessing(),
    run: useClassificationDemoSession(),
  }));
  await waitFor(() => expect(offer.result.current.downloads).not.toBeNull());
  expect(offer.result.current.run).toBeNull();
  expect(
    localStorage.getItem("stirling-desktop-classification-demo-has-run"),
  ).toBeNull();

  act(() => offer.result.current.downloads!.start());
  expect(offer.result.current.run?.limit).toBe(10);
  act(() => {
    expect(claimRun(offer.result.current.run!.runToken)).toBe(true);
  });
  expect(offer.result.current.downloads).toBeNull();
  expect(
    localStorage.getItem("stirling-desktop-classification-demo-has-run"),
  ).toBe("true");
  act(endClassificationDemo);
  expect(offer.result.current.run).toBeNull();
  expect(offer.result.current.downloads).toBeNull();
  offer.unmount();
  expect(renderHook(useDownloadsProcessing).result.current).toBeNull();
});
