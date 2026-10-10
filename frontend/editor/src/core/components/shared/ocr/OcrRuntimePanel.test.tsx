import { describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import OcrRuntimePanel from "@app/components/shared/ocr/OcrRuntimePanel";
import type { OcrRuntimeStatus } from "@app/services/ocrRuntimeService";

const mocks = vi.hoisted(() => ({ getStatus: vi.fn() }));

vi.mock("@app/services/ocrRuntimeService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/ocrRuntimeService")>()),
  getOcrRuntimeStatus: mocks.getStatus,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: "en-US" },
  }),
}));

const status = (installed: string[]): OcrRuntimeStatus => ({
  engineInstalled: true,
  platform: "windows-x86_64",
  installedLanguages: installed,
  catalogueReachable: true,
  availableLanguages: {
    eng: {
      url: "https://example.invalid/eng.traineddata",
      size: 1,
      sha256: "a",
      name: "English",
    },
    spa: {
      url: "https://example.invalid/spa.traineddata",
      size: 1,
      sha256: "b",
      name: "Spanish",
    },
  },
});

const panel = (active: boolean) => (
  <MantineProvider>
    <OcrRuntimePanel active={active} />
  </MantineProvider>
);

describe("OcrRuntimePanel", () => {
  // Closing and reopening the dialog starts a second status request while the
  // first is still out; the first can then come back last.
  test("an answer that arrives late does not overwrite a newer one", async () => {
    let answerFirst!: (value: OcrRuntimeStatus) => void;
    let answerSecond!: (value: OcrRuntimeStatus) => void;
    mocks.getStatus
      .mockImplementationOnce(
        () =>
          new Promise<OcrRuntimeStatus>((resolve) => {
            answerFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<OcrRuntimeStatus>((resolve) => {
            answerSecond = resolve;
          }),
      );

    const { rerender } = render(panel(true));
    rerender(panel(false));
    rerender(panel(true));

    await act(async () => answerSecond(status(["spa"])));
    await act(async () => answerFirst(status(["eng"])));

    expect(screen.getByRole("checkbox", { name: /Spanish/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /English/ })).not.toBeChecked();
  });
});
