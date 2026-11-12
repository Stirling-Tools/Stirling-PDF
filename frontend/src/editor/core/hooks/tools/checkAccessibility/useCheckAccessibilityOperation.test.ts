import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn() },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import apiClient from "@editor/services/apiClient";
import { createStirlingFile } from "@editor/types/fileContext";
import { useCheckAccessibilityOperation } from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityOperation";
import { defaultParameters } from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityParameters";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";

function pdf(name: string) {
  return createStirlingFile(
    new File(["%PDF-1.7"], name, { type: "application/pdf" }),
  );
}

function report(overrides: Partial<AccessibilityReport> = {}) {
  return {
    profile: "PDF/UA-1",
    tagged: true,
    declaresConformance: true,
    passesAutomatedChecks: true,
    issues: [],
    humanChecks: [],
    automaticallyFixable: 0,
    needsInput: 0,
    figuresNeedingDescription: [],
    summary: {
      pages: 1,
      hasTitle: true,
      displaysDocTitle: true,
      hasLanguage: true,
      allFontsEmbedded: true,
      unembeddedFonts: 0,
      figures: 0,
      encrypted: false,
    },
    ...overrides,
  } satisfies AccessibilityReport;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("useCheckAccessibilityOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats a report the validator could not produce as a failed file", async () => {
    (apiClient.post as Mock).mockResolvedValue({
      data: report({
        passesAutomatedChecks: false,
        validationError: "Validation could not run: bad xref",
      }),
    });
    const { result } = renderHook(() => useCheckAccessibilityOperation());

    await act(() =>
      result.current.executeOperation(defaultParameters, [pdf("a.pdf")]),
    );

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].report).toBeNull();
    expect(result.current.results[0].error).toBe(
      "Validation could not run: bad xref",
    );
    expect(result.current.errorMessage).toBe(
      "Some files could not be checked.",
    );
  });

  it("keeps a cancelled run from resuming beside the run that replaced it", async () => {
    const stalled = deferred<{ data: AccessibilityReport }>();
    (apiClient.post as Mock)
      .mockReturnValueOnce(stalled.promise)
      .mockResolvedValue({ data: report() });
    const { result } = renderHook(() => useCheckAccessibilityOperation());

    let firstRun!: Promise<void>;
    act(() => {
      firstRun = result.current.executeOperation(defaultParameters, [
        pdf("old-1.pdf"),
        pdf("old-2.pdf"),
      ]);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    act(() => result.current.cancelOperation());

    await act(() =>
      result.current.executeOperation(defaultParameters, [pdf("new.pdf")]),
    );
    await act(async () => {
      stalled.resolve({ data: report() });
      await firstRun;
    });

    expect(result.current.results.map((entry) => entry.fileName)).toEqual([
      "new.pdf",
    ]);
    expect(apiClient.post).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(false);
  });
  it("stops loading when results are reset mid-run", async () => {
    const stalled = deferred<{ data: AccessibilityReport }>();
    (apiClient.post as Mock).mockReturnValueOnce(stalled.promise);
    const { result } = renderHook(() => useCheckAccessibilityOperation());

    let run!: Promise<void>;
    act(() => {
      run = result.current.executeOperation(defaultParameters, [pdf("a.pdf")]);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    act(() => result.current.resetResults());
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      stalled.resolve({ data: report() });
      await run;
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it("aborts the request in flight and checks no more files once unmounted", async () => {
    const stalled = deferred<{ data: AccessibilityReport }>();
    (apiClient.post as Mock).mockReturnValueOnce(stalled.promise);
    const { result, unmount } = renderHook(() =>
      useCheckAccessibilityOperation(),
    );

    let run!: Promise<void>;
    act(() => {
      run = result.current.executeOperation(defaultParameters, [
        pdf("a.pdf"),
        pdf("b.pdf"),
      ]);
    });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const { signal } = (apiClient.post as Mock).mock.calls[0][2] as {
      signal: AbortSignal;
    };
    unmount();
    expect(signal.aborted).toBe(true);

    stalled.resolve({ data: report() });
    await run;
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it("leaves files empty so the next selection change clears the report", async () => {
    (apiClient.post as Mock).mockResolvedValue({ data: report() });
    const { result } = renderHook(() => useCheckAccessibilityOperation());
    await act(() =>
      result.current.executeOperation(defaultParameters, [pdf("a.pdf")]),
    );
    expect(result.current.results).toHaveLength(1);
    expect(result.current.files).toEqual([]);
  });
});
