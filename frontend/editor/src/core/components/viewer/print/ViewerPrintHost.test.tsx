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
  }),
}));

vi.mock("@embedpdf/plugin-print/react", () => ({
  usePrintCapability: () => ({ provides: { print: mocks.viewerPrint } }),
}));

import { ViewerPrintHost } from "@app/components/viewer/print/ViewerPrintHost";
import { expectConsole } from "@app/tests/failOnConsole";

const pdf = () => new Blob(["%PDF"], { type: "application/pdf" });

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

const renderHost = (systemPrintDialog = false) => {
  render(
    <MantineProvider env="test">
      <ViewerPrintHost
        fileName="report.pdf"
        systemPrintDialog={systemPrintDialog}
      />
    </MantineProvider>,
  );
};

describe("ViewerPrintHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
