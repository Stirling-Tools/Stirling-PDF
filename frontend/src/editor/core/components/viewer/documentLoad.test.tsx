import React, { StrictMode } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentSwapBridge } from "@editor/components/viewer/DocumentSwapBridge";
import { InitialDocumentLoadBridge } from "@editor/components/viewer/InitialDocumentLoadBridge";
import { useDocumentLoadWaiter } from "@editor/components/viewer/useDocumentLoadWaiter";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  activate: vi.fn(),
  active: { status: "loading", error: null as string | null },
}));
vi.mock("@embedpdf/plugin-document-manager/react", () => {
  const manager = {
    getActiveDocumentId: () => "old",
    openDocumentBuffer: mocks.open,
    closeDocument: mocks.close,
    setActiveDocument: mocks.activate,
  };
  return {
    useDocumentManagerCapability: () => ({ provides: manager }),
    useActiveDocument: () => ({ activeDocument: mocks.active }),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const pending = (fileKey: string) => ({
  fileKey,
  buffer: new ArrayBuffer(1),
  name: "form.pdf",
});

describe("form save document completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.close.mockReturnValue({ toPromise: () => Promise.resolve() });
    mocks.active = { status: "loading", error: null };
  });

  it.each(
    [undefined, "session-password"].flatMap((password) =>
      [undefined, true, false].map((honorOwnerPasswords) => ({
        password,
        honorOwnerPasswords,
      })),
    ),
  )(
    "waits for the saved document's loaded task and ignores unrelated document events (password: $password, honorOwnerPasswords: $honorOwnerPasswords)",
    async ({ password, honorOwnerPasswords }) => {
      const load = deferred<void>();
      mocks.open.mockReturnValue({
        toPromise: async () => ({
          documentId: "saved",
          task: { toPromise: () => load.promise },
        }),
      });
      const { result } = renderHook(useDocumentLoadWaiter);
      const saved = result.current.waitForDocument("B-saved");
      const completed = vi.fn();
      void saved.then(completed);
      result.current.documentReady("A");
      result.current.documentFailed("A", new Error("unrelated"));
      const replacement = {
        ...pending("B-saved"),
        password,
        honorOwnerPasswords,
      };
      render(
        <DocumentSwapBridge
          pending={replacement}
          onSwapped={(_, key) => result.current.documentReady(key)}
          onFailed={result.current.documentFailed}
        />,
      );
      await act(async () => {});
      expect(mocks.open).toHaveBeenCalledExactlyOnceWith({
        buffer: replacement.buffer,
        name: replacement.name,
        password,
        permissions: {
          enforceDocumentPermissions: honorOwnerPasswords !== false,
        },
        autoActivate: false,
      });
      expect(completed).not.toHaveBeenCalled();
      await act(async () => load.resolve());
      await saved;
      expect(mocks.activate).toHaveBeenCalledWith("saved");
      expect(completed).toHaveBeenCalledOnce();
    },
  );

  it.each(["unmount", "clear"])(
    "rejects a save when its swap is cancelled by %s",
    async (action) => {
      const load = deferred<void>();
      mocks.open.mockReturnValue({
        toPromise: async () => ({
          documentId: "saved",
          task: { toPromise: () => load.promise },
        }),
      });
      const { result } = renderHook(useDocumentLoadWaiter);
      const saved = result.current.waitForDocument("B");
      const rejected = expect(saved).rejects.toThrow("cancelled");
      const props = {
        pending: pending("B"),
        onSwapped: vi.fn(),
        onFailed: result.current.documentFailed,
      };
      const view = render(<DocumentSwapBridge {...props} />);
      await act(async () => {});
      await act(async () => {
        if (action === "unmount") view.unmount();
        else view.rerender(<DocumentSwapBridge {...props} pending={null} />);
      });
      await rejected;
      await act(async () => load.resolve());
      expect(props.onSwapped).not.toHaveBeenCalled();
      expect(mocks.close).toHaveBeenCalledWith("saved");
    },
  );

  it("rejects the superseded request without failing its replacement", async () => {
    const first = deferred<void>(),
      second = deferred<void>();
    mocks.open
      .mockReturnValueOnce({
        toPromise: async () => ({
          documentId: "first",
          task: { toPromise: () => first.promise },
        }),
      })
      .mockReturnValueOnce({
        toPromise: async () => ({
          documentId: "second",
          task: { toPromise: () => second.promise },
        }),
      });
    const failed = vi.fn(),
      swapped = vi.fn();
    const view = render(
      <DocumentSwapBridge
        pending={pending("first")}
        onSwapped={swapped}
        onFailed={failed}
      />,
    );
    await act(async () => {});
    await act(async () =>
      view.rerender(
        <DocumentSwapBridge
          pending={pending("second")}
          onSwapped={swapped}
          onFailed={failed}
        />,
      ),
    );
    expect(failed).toHaveBeenCalledWith("first", expect.any(Error));
    await act(async () => {
      first.resolve();
      second.resolve();
    });
    expect(swapped).toHaveBeenCalledExactlyOnceWith("second", "second");
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("survives StrictMode effect replay and callback identity changes", async () => {
    const load = deferred<void>();
    mocks.open.mockReturnValue({
      toPromise: async () => ({
        documentId: "saved",
        task: { toPromise: () => load.promise },
      }),
    });
    const failed = vi.fn(),
      swapped = vi.fn(),
      source = pending("B");
    const view = render(
      <StrictMode>
        <DocumentSwapBridge
          pending={source}
          onSwapped={swapped}
          onFailed={failed}
        />
      </StrictMode>,
    );
    await act(async () => {});
    view.rerender(
      <StrictMode>
        <DocumentSwapBridge
          pending={source}
          onSwapped={(id, key) => swapped(id, key)}
          onFailed={failed}
        />
      </StrictMode>,
    );
    await act(async () => load.resolve());
    expect(failed).not.toHaveBeenCalled();
    expect(swapped).toHaveBeenCalledExactlyOnceWith("saved", "B");
  });

  it("settles the save when a remounted viewer opens it as its initial document", async () => {
    const { result } = renderHook(useDocumentLoadWaiter);
    const saved = result.current.waitForDocument("B-saved");
    const completed = vi.fn();
    void saved.then(completed);
    const view = render(
      <InitialDocumentLoadBridge
        fileKey="B-saved"
        onReady={result.current.documentReady}
        onFailed={result.current.documentFailed}
      />,
    );
    expect(completed).not.toHaveBeenCalled();
    mocks.active = { status: "loaded", error: null };
    view.rerender(
      <InitialDocumentLoadBridge
        fileKey="B-saved"
        onReady={result.current.documentReady}
        onFailed={result.current.documentFailed}
      />,
    );
    await saved;
    expect(completed).toHaveBeenCalledOnce();
  });

  it("rejects a failed initial document load", async () => {
    const { result } = renderHook(useDocumentLoadWaiter);
    const saved = result.current.waitForDocument("B");
    const rejected = expect(saved).rejects.toThrow("invalid PDF");
    mocks.active = { status: "error", error: "invalid PDF" };
    render(
      <InitialDocumentLoadBridge
        fileKey="B"
        onReady={result.current.documentReady}
        onFailed={result.current.documentFailed}
      />,
    );
    await rejected;
  });

  it("reports readiness after retrying a failed initial load", () => {
    const props = { fileKey: "B", onReady: vi.fn(), onFailed: vi.fn() };
    mocks.active = { status: "error", error: "inspection failed" };
    const view = render(<InitialDocumentLoadBridge {...props} />);
    expect(props.onFailed).toHaveBeenCalledOnce();
    mocks.active = { status: "loading", error: null };
    view.rerender(<InitialDocumentLoadBridge {...props} />);
    expect(props.onReady).not.toHaveBeenCalled();
    mocks.active = { status: "loaded", error: null };
    view.rerender(<InitialDocumentLoadBridge {...props} />);
    view.rerender(<InitialDocumentLoadBridge {...props} />);
    expect(props.onReady).toHaveBeenCalledExactlyOnceWith("B");
    expect(props.onFailed).toHaveBeenCalledOnce();
  });

  it("rejects an initial load when only the inner viewer unmounts", async () => {
    const { result } = renderHook(useDocumentLoadWaiter);
    const saved = result.current.waitForDocument("B");
    const rejected = expect(saved).rejects.toThrow("cancelled");
    const view = render(
      <StrictMode>
        <InitialDocumentLoadBridge
          fileKey="B"
          onReady={result.current.documentReady}
          onFailed={result.current.documentFailed}
        />
      </StrictMode>,
    );
    const failed = vi.fn();
    void saved.catch(failed);
    await act(async () => {});
    expect(failed).not.toHaveBeenCalled();
    await act(async () => view.unmount());
    await rejected;
  });

  it("rejects a synchronous opening failure", async () => {
    mocks.open.mockImplementation(() => {
      throw new Error("open threw");
    });
    const failed = vi.fn();
    render(
      <DocumentSwapBridge
        pending={pending("B")}
        onSwapped={vi.fn()}
        onFailed={failed}
      />,
    );
    await waitFor(() =>
      expect(failed).toHaveBeenCalledWith(
        "B",
        expect.objectContaining({ message: "open threw" }),
      ),
    );
  });

  it("rejects both an outstanding save and a late request after the viewer closes", async () => {
    const { result, unmount } = renderHook(useDocumentLoadWaiter);
    const saved = result.current.waitForDocument("B");
    const rejected = expect(saved).rejects.toThrow("viewer closed");
    unmount();
    await rejected;
    await expect(result.current.waitForDocument("late")).rejects.toThrow(
      "viewer closed",
    );
  });

  it("rejects an opening task failure without waiting for a load task", async () => {
    mocks.open.mockReturnValue({
      toPromise: () => Promise.reject(new Error("open failed")),
    });
    const failed = vi.fn();
    render(
      <DocumentSwapBridge
        pending={pending("B")}
        onSwapped={vi.fn()}
        onFailed={failed}
      />,
    );
    await waitFor(() =>
      expect(failed).toHaveBeenCalledWith(
        "B",
        expect.objectContaining({ message: "open failed" }),
      ),
    );
  });
});
