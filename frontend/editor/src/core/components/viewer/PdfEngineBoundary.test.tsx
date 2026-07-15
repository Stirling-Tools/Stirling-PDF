import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

// Controllable stand-in for the library engine hook so we can simulate the
// three states that matter: still loading, loaded, and errored.
let engineState: { engine: unknown; isLoading: boolean; error: Error | null } =
  {
    engine: null,
    isLoading: true,
    error: null,
  };

vi.mock("@embedpdf/engines/react", () => ({
  usePdfiumEngine: () => engineState,
}));

import { PdfEngineBoundary } from "@app/components/viewer/PdfEngineBoundary";

const renderBoundary = (onRetry = vi.fn(), timeoutMs = 1000) => {
  const utils = render(
    <MantineProvider>
      <PdfEngineBoundary
        wasmUrl="pdfium.wasm"
        onRetry={onRetry}
        timeoutMs={timeoutMs}
      >
        {() => <div>PDF CONTENT</div>}
      </PdfEngineBoundary>
    </MantineProvider>,
  );
  return { onRetry, ...utils };
};

const wrap = (node: ReactNode) => <MantineProvider>{node}</MantineProvider>;

describe("PdfEngineBoundary", () => {
  beforeEach(() => {
    engineState = { engine: null, isLoading: true, error: null };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the loading fallback while the engine is initialising", () => {
    renderBoundary();
    expect(screen.getByText("Loading PDF Engine...")).toBeInTheDocument();
    expect(screen.queryByText("viewer.engineLoadErrorTitle")).toBeNull();
  });

  it("surfaces an error with a retry after the load times out (no infinite spinner)", () => {
    const { onRetry } = renderBoundary(vi.fn(), 1000);

    // Still spinning before the timeout elapses.
    expect(screen.getByText("Loading PDF Engine...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The spinner is replaced by an actionable error state.
    expect(screen.queryByText("Loading PDF Engine...")).toBeNull();
    expect(screen.getByText("viewer.engineLoadErrorTitle")).toBeInTheDocument();

    const retry = screen.getByText("viewer.engineLoadErrorRetry");
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error immediately when the engine load rejects", () => {
    engineState = {
      engine: null,
      isLoading: false,
      error: new Error("boom"),
    };
    render(
      wrap(
        <PdfEngineBoundary wasmUrl="pdfium.wasm" onRetry={vi.fn()}>
          {() => <div>PDF CONTENT</div>}
        </PdfEngineBoundary>,
      ),
    );
    expect(screen.getByText("viewer.engineLoadErrorTitle")).toBeInTheDocument();
  });

  it("renders children once the engine is ready", () => {
    engineState = { engine: {}, isLoading: false, error: null };
    render(
      wrap(
        <PdfEngineBoundary wasmUrl="pdfium.wasm" onRetry={vi.fn()}>
          {() => <div>PDF CONTENT</div>}
        </PdfEngineBoundary>,
      ),
    );
    expect(screen.getByText("PDF CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("Loading PDF Engine...")).toBeNull();
  });
});
