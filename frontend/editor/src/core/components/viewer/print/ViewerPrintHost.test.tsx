import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerBridge: vi.fn(),
  saveAsCopy: vi.fn(),
  post: vi.fn(),
  viewerPrint: vi.fn(),
  printPdfBlob: vi.fn(),
  activeFileId: "doc-a" as string | null,
  printDialogProps: [] as Array<{
    documentId?: string | null;
    error?: string | null;
  }>,
}));

vi.mock("@app/services/printService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/printService")>()),
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
import { expectConsole } from "@app/tests/failOnConsole";
import { renderInProviders, viewerAt } from "@app/tests/utils/printTestUtils";
import JSZip from "jszip";

const pdf = () => new Blob(["%PDF"], { type: "application/pdf" });

/** A promise a test settles when the request under test should complete. */
const deferred = <T = unknown,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

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

const hostTree = (systemPrintDialog = false) => (
  <ViewerPrintHost
    fileName="report.pdf"
    systemPrintDialog={systemPrintDialog}
  />
);

/**
 * The dialog reads the document's page count from the viewer context, which the
 * host's own viewer is mocked out of, so a test that needs the count supplies
 * its own viewer.
 */
const renderHost = (systemPrintDialog = false, pageCount?: number) =>
  renderInProviders(hostTree(systemPrintDialog), {
    viewer: pageCount === undefined ? undefined : viewerAt(pageCount),
  });

describe("ViewerPrintHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeFileId = "doc-a";
    mocks.printDialogProps.length = 0;
    mocks.viewerPrint.mockReturnValue({ toPromise: () => Promise.resolve() });
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
    renderHost(false, 4);
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
    renderInProviders(
      <ViewerPrintHost fileName="report.pdf" canPrint={false} />,
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

  it("keeps the dialog open with the reason when the viewer refuses the job", async () => {
    expectConsole.error("Print failed");
    mocks.viewerPrint.mockReturnValue({
      toPromise: () => Promise.reject(new Error("viewer refused")),
    });
    renderHost();
    openDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );

    await waitFor(() =>
      expect(mocks.printDialogProps.at(-1)?.error).toBe("viewer refused"),
    );
    expect(dialogOpen()).toBe(true);
  });

  it("prints the PDF inside the archive the imposition endpoints answer with", async () => {
    const zip = new JSZip();
    zip.file("report_poster.pdf", "%PDF-1.7 poster");
    mocks.post.mockResolvedValue({
      data: await zip.generateAsync({ type: "blob" }),
    });
    renderHost();
    openDialog();
    choosePreset("viewer.print.presetPoster");

    fireEvent.click(
      screen.getByRole("button", { name: "viewer.print.confirm" }),
    );

    await waitFor(() => expect(mocks.printPdfBlob).toHaveBeenCalledTimes(1));
    const [source, name] = mocks.printPdfBlob.mock.calls[0] as [Blob, string];
    expect(name).toBe("report - poster.pdf");
    expect(source.type).toBe("application/pdf");
    const bytes = new Uint8Array(await source.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("aborts the backend request when the dialog is closed during preparation", async () => {
    const pending = deferred();
    mocks.post.mockReturnValue(pending.promise);
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
      pending.resolve({ data: pdf() });
    });
    expect(mocks.printPdfBlob).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });

  it("keeps a dialog reopened after a cancel untouched by the abandoned job", async () => {
    const pending = deferred();
    mocks.post.mockReturnValue(pending.promise);
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
      pending.resolve({ data: pdf() });
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
    const pending = deferred();
    mocks.post.mockReturnValue(pending.promise);
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
      pending.resolve({ data: pdf() });
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
    const pendingA = deferred();
    const pendingB = deferred();
    mocks.post
      .mockReturnValueOnce(pendingA.promise)
      .mockReturnValueOnce(pendingB.promise);

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
      pendingA.resolve({ data: pdf() });
    });
    expect(mocks.printPdfBlob).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "viewer.print.preparing" }),
    ).toBeTruthy();

    await act(async () => {
      pendingB.resolve({ data: pdf() });
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
