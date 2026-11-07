import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@editor/tools/pdfTextEditor/hooks/useDocumentLoader", () => ({
  ensureAllPagesRead: vi.fn(),
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
  return { dispatch };
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
});
