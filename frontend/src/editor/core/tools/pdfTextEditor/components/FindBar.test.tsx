import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@editor/tools/pdfTextEditor/hooks/useDocumentLoader", () => ({
  readAllPagesInBackground: vi.fn(() => () => {}),
}));
vi.mock(
  "@editor/tools/pdfTextEditor/commands/scanTextEdit",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    prefitScanRun: vi.fn(() => true),
    scanRunNeedsFit: vi.fn(() => false),
  }),
);

import { FindBar } from "@editor/tools/pdfTextEditor/components/FindBar";
import {
  prefitScanRun,
  scanRunNeedsFit,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

function setup() {
  const runs = [
    { id: "a", text: "Invoice for Jane", locked: false },
    { id: "b", text: "Jane Example", locked: false },
  ];
  const page = {
    index: 0,
    runs,
    findRun: (id: string) => runs.find((r) => r.id === id),
  };
  const dispatch = vi.fn();
  const store = {
    dispatch,
    document: { loadedPages: () => [page] },
    selection: {
      selectOne: vi.fn(),
      highlight: { set: vi.fn() },
    },
  } as unknown as EditorStore;
  const pages = [{ pageIndex: 0, runs }] as unknown as PageSnapshot[];
  render(
    <MantineProvider env="test">
      <FindBar store={store} pages={pages} onClose={vi.fn()} />
    </MantineProvider>,
  );
  return { dispatch, runs };
}

describe("Replace all on unfitted scanned text", () => {
  afterEach(() => {
    vi.mocked(prefitScanRun).mockReset().mockReturnValue(true);
    vi.mocked(scanRunNeedsFit).mockReset().mockReturnValue(false);
  });

  it("fits each scanned block in slices while busy, then replaces", async () => {
    const fitted = new Set<string>();
    let calls = 0;
    vi.mocked(scanRunNeedsFit).mockImplementation(
      (_doc, r) => !fitted.has(r.id),
    );
    vi.mocked(prefitScanRun).mockImplementation((_doc, _page, r) => {
      calls++;
      if (calls % 2 === 1) return false;
      fitted.add(r.id);
      return true;
    });
    const { dispatch } = setup();
    fireEvent.change(screen.getByTestId("pdf-editor-find-input"), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByTestId("pdf-editor-replace-input"), {
      target: { value: "Mary" },
    });

    fireEvent.click(screen.getByTestId("pdf-editor-replace-all"));

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId("pdf-editor-replace-all")).toBeDisabled();
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(fitted).toEqual(new Set(["a", "b"]));
    for (const [, , , deadline] of vi.mocked(prefitScanRun).mock.calls)
      expect(Number.isFinite(deadline)).toBe(true);
  });

  it("replaces in the text each run holds once the fit has finished", async () => {
    const fitted = new Set<string>();
    vi.mocked(scanRunNeedsFit).mockImplementation(
      (_doc, r) => !fitted.has(r.id),
    );
    const { dispatch, runs } = setup();
    vi.mocked(prefitScanRun).mockImplementation((_doc, _page, r) => {
      if (r.id === "a" && !runs[0].text.endsWith("Doe")) {
        runs[0].text = "Invoice for Jane Doe";
        return false;
      }
      fitted.add(r.id);
      return true;
    });
    fireEvent.change(screen.getByTestId("pdf-editor-find-input"), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByTestId("pdf-editor-replace-input"), {
      target: { value: "Mary" },
    });

    fireEvent.click(screen.getByTestId("pdf-editor-replace-all"));

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    const { commands } = dispatch.mock.calls[0][0] as unknown as {
      commands: EditTextCommand[];
    };
    expect(commands.map((c) => c.resultText)).toEqual([
      "Invoice for Mary Doe",
      "Mary Example",
    ]);
  });
  it("ignores Enter in the replace field while Replace all is fitting", async () => {
    const fitted = new Set<string>();
    let hold = true;
    vi.mocked(scanRunNeedsFit).mockImplementation(
      (_doc, r) => !fitted.has(r.id),
    );
    vi.mocked(prefitScanRun).mockImplementation((_doc, _page, r) => {
      if (hold) return false;
      fitted.add(r.id);
      return true;
    });
    const { dispatch } = setup();
    fireEvent.change(screen.getByTestId("pdf-editor-find-input"), {
      target: { value: "Jane" },
    });
    const replaceInput = screen.getByTestId("pdf-editor-replace-input");
    fireEvent.change(replaceInput, { target: { value: "Mary" } });

    fireEvent.click(screen.getByTestId("pdf-editor-replace-all"));
    await waitFor(() =>
      expect(vi.mocked(prefitScanRun).mock.calls.length).toBeGreaterThan(1),
    );
    fireEvent.keyDown(replaceInput, { key: "Enter" });

    expect(dispatch).not.toHaveBeenCalled();
    hold = false;
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    const { commands } = dispatch.mock.calls[0][0] as unknown as {
      commands: EditTextCommand[];
    };
    expect(commands.map((c) => c.resultText)).toEqual([
      "Invoice for Mary",
      "Mary Example",
    ]);
  });
});
