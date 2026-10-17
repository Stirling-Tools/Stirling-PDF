import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerBridge: vi.fn(),
  saveAsCopy: vi.fn(),
  post: vi.fn(),
  viewerPrint: vi.fn(),
  printPdfBlob: vi.fn(),
  activeFileId: "doc-a" as string | null,
  printDialogProps: [] as Array<{ documentId?: string | null }>,
}));

vi.mock("@app/services/printService", () => ({
  printPdfBlob: mocks.printPdfBlob,
}));

vi.mock("@app/services/apiClient", () => ({
  default: { post: mocks.post },
}));

vi.mock("@app/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => true,
}));

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    registerBridge: mocks.registerBridge,
    exportActions: { saveAsCopy: mocks.saveAsCopy },
    activeFileId: mocks.activeFileId,
  }),
}));

// Records the props the host hands the dialog while still rendering the real
// one, so the prop assertions do not replace the behaviour the rest exercises.
vi.mock("@app/components/viewer/print/PrintDialog", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/components/viewer/print/PrintDialog")
    >();

  function RecordingPrintDialog(
    props: Parameters<typeof actual.PrintDialog>[0],
  ) {
    mocks.printDialogProps.push(props);
    return actual.PrintDialog(props);
  }

  return { ...actual, PrintDialog: RecordingPrintDialog };
});

vi.mock("@embedpdf/plugin-print/react", () => ({
  usePrintCapability: () => ({ provides: { print: mocks.viewerPrint } }),
}));

import { ViewerPrintHost } from "@app/components/viewer/print/ViewerPrintHost";
import { ViewerContext } from "@app/contexts/viewer/viewerContext";
import { expectConsole } from "@app/tests/failOnConsole";

const pdf = () => new Blob(["%PDF"], { type: "application/pdf" });

/** A viewer stub supplying only what the dialog's position and preview hooks read. */
const viewerAt = (pageCount: number) =>
  ({
    activeFileId: "doc-a",
    getScrollState: () => ({ currentPage: 1, totalPages: pageCount }),
    registerImmediateScrollUpdate: () => () => {},
    getThumbnailAPI: () => null,
  }) as never;

/** Opens the dialog the way the viewer's print action does. */
const openDialog = () => {
  const call = mocks.registerBridge.mock.calls.at(-1);
  if (!call || call[0] !== "print") {
    throw new Error("the print bridge was not registered");
  }
  const bridge = call[1] as { api: { print: () => void } } | null;
  if (!bridge) {
    throw new Error("the print bridge was registered without an api");
  }
  act(() => {
    bridge.api.print();
  });
};

const dialogOpen = () =>
  screen.queryByRole("button", { name: "common.cancel" }) !== null;

const choosePreset = (preset: string) => {
  fireEvent.click(screen.getByText(preset));
};

const hostTree = (systemPrintDialog = false, pageCount?: number) => {
  const host = (
    <ViewerPrintHost
      fileName="report.pdf"
      systemPrintDialog={systemPrintDialog}
    />
  );

  return (
    <MantineProvider env="test">
      {pageCount === undefined ? (
        host
      ) : (
        // The dialog reads the document's page count from the viewer context,
        // which the host's own viewer is mocked out of.
        <ViewerContext.Provider value={viewerAt(pageCount)}>
          {host}
        </ViewerContext.Provider>
      )}
    </MantineProvider>
  );
};

const renderHost = (systemPrintDialog = false) =>
  render(hostTree(systemPrintDialog));

describe("ViewerPrintHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeFileId = "doc-a";
    mocks.printDialogProps.length = 0;
    mocks.printPdfBlob.mockResolvedValue(undefined);
    mocks.saveAsCopy.mockResolvedValue(pdf());
    mocks.post.mockResolvedValue({ data: pdf() });
  });

  it("prints the standard layout through the viewer without touching the server", async () => {
    renderHost();
    openDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );

    await waitFor(() =>
      expect(mocks.viewerPrint).toHaveBeenCalledWith({
        pageRange: undefined,
        includeAnnotations: true,
      }),
    );
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.printPdfBlob).not.toHaveBeenCalled();
    await waitFor(() => expect(dialogOpen()).toBe(false));
  });

  it("expands the odd/even filter to the pages the viewer prints", async () => {
    render(hostTree(false, 4));
    openDialog();

    fireEvent.click(screen.getByText("viewer.print.pageScopeCustom"));
    fireEvent.change(
      screen.getByPlaceholderText("viewer.print.pageRangePlaceholder"),
      { target: { value: "1-4" } },
    );

    // The all filter hands the typed range to the viewer untouched.
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );
    await waitFor(() =>
      expect(mocks.viewerPrint).toHaveBeenLastCalledWith({
        pageRange: "1-4",
        includeAnnotations: true,
      }),
    );

    // Reopening keeps the reader's filter, and the job now states the pages it
    // selects rather than a range the viewer cannot filter itself.
    openDialog();
    fireEvent.click(screen.getByText("viewer.print.parityOdd"));
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );
    await waitFor(() =>
      expect(mocks.viewerPrint).toHaveBeenLastCalledWith({
        pageRange: "1, 3",
        includeAnnotations: true,
      }),
    );
  });

  it("offers no print action for a document that forbids printing", () => {
    render(
      <MantineProvider env="test">
        <ViewerPrintHost fileName="report.pdf" canPrint={false} />
      </MantineProvider>,
    );

    expect(mocks.registerBridge).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });

  it("hands the exported document to a platform that owns the print dialog", async () => {
    renderHost(true);
    openDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );

    await waitFor(() => expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1));
    const [source, name] = mocks.printPdfBlob.mock.calls[0] as [Blob, string];
    expect(name).toBe("report.pdf");
    expect(source).toBeInstanceOf(File);
    expect(mocks.viewerPrint).not.toHaveBeenCalled();
  });

  it("aborts the backend request when the dialog is closed during preparation", async () => {
    let settle = (_value: unknown) => {};
    mocks.post.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderHost();
    openDialog();
    choosePreset("viewer.print.presetPoster");
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const request = (mocks.post.mock.calls[0] as unknown[])[2] as {
      signal: AbortSignal;
    };
    expect(request.signal).toBeInstanceOf(AbortSignal);

    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(request.signal.aborted).toBe(true);

    await act(async () => {
      settle({ data: pdf() });
    });
    expect(mocks.printPdfBlob).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });

  it("keeps a dialog reopened after a cancel untouched by the abandoned job", async () => {
    let settle = (_value: unknown) => {};
    mocks.post.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderHost();
    openDialog();
    choosePreset("viewer.print.presetPoster");
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    openDialog();
    expect(dialogOpen()).toBe(true);

    await act(async () => {
      settle({ data: pdf() });
    });

    expect(dialogOpen()).toBe(true);
    expect(screen.queryByText("viewer.print.emptyOutput")).toBeNull();
    expect(mocks.printPdfBlob).not.toHaveBeenCalled();
  });

  it("fails rather than printing the document without the viewer's edits", async () => {
    expectConsole.error("Print failed");
    mocks.saveAsCopy.mockResolvedValue(null);
    renderHost();
    openDialog();
    choosePreset("viewer.print.presetPoster");
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );

    await waitFor(() =>
      expect(screen.getByText("viewer.print.readFailed")).toBeTruthy(),
    );
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.printPdfBlob).not.toHaveBeenCalled();
  });

  it("reports a backend failure and prints again on a retry", async () => {
    expectConsole.error("Print failed");
    mocks.post.mockRejectedValueOnce(new Error("layout service is down"));
    renderHost();
    openDialog();
    choosePreset("viewer.print.presetPoster");
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );

    await waitFor(() =>
      expect(screen.getByText("layout service is down")).toBeTruthy(),
    );
    expect(dialogOpen()).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );

    await waitFor(() => expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });

  it("cancels an in-flight job when another document opens under the same name", async () => {
    let settle = (_value: unknown) => {};
    mocks.post.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const view = renderHost();
    openDialog();
    choosePreset("viewer.print.presetPoster");
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const request = (mocks.post.mock.calls[0] as unknown[])[2] as {
      signal: AbortSignal;
    };
    expect(request.signal.aborted).toBe(false);

    // The next document arrives under the same fileName, so the name cannot
    // tell the two apart; only the document's identity can.
    mocks.activeFileId = "doc-b";
    view.rerender(hostTree());

    expect(request.signal.aborted).toBe(true);

    await act(async () => {
      settle({ data: pdf() });
    });
    expect(mocks.printPdfBlob).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    ).toBeTruthy();
  });

  it("hands printPdfBlob the job's own signal and aborts it with the document", async () => {
    mocks.printPdfBlob.mockReturnValue(new Promise(() => {}));
    const view = renderHost(true);
    openDialog();
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );
    await waitFor(() => expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1));

    const signal = (
      mocks.printPdfBlob.mock.calls[0] as unknown[]
    )[2] as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    mocks.activeFileId = "doc-b";
    view.rerender(hostTree(true));

    expect(signal.aborted).toBe(true);
  });

  it("ignores a completion from the document that was open before", async () => {
    let settleA = (_value: unknown) => {};
    let settleB = (_value: unknown) => {};
    mocks.post
      .mockReturnValueOnce(
        new Promise((resolve) => {
          settleA = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          settleB = resolve;
        }),
      );

    const view = renderHost();
    openDialog();
    choosePreset("viewer.print.presetPoster");
    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));

    mocks.activeFileId = "doc-b";
    view.rerender(hostTree());

    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: "viewer.print.preparing" }),
    ).toBeTruthy();

    // A's late bytes must neither print nor clear the busy state B set.
    await act(async () => {
      settleA({ data: pdf() });
    });
    expect(mocks.printPdfBlob).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "viewer.print.preparing" }),
    ).toBeTruthy();

    await act(async () => {
      settleB({ data: pdf() });
    });
    await waitFor(() => expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1));
  });

  it("tells the dialog which document the page selection belongs to", () => {
    const view = renderHost();

    expect(mocks.printDialogProps.at(-1)?.documentId).toBe("doc-a");

    mocks.activeFileId = "doc-b";
    view.rerender(hostTree());

    expect(mocks.printDialogProps.at(-1)?.documentId).toBe("doc-b");
  });
});
