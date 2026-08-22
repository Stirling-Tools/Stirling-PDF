/**
 * Staged edits are keyed to the file they were made against, and a commit's skip
 * report must survive the re-fetch that the commit itself triggers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import {
  FormFillProvider,
  useFormFill,
} from "@app/tools/formFill/FormFillContext";
import type { FieldEditResult } from "@app/tools/formFill/types";

const applyFieldEdits = vi.fn();
const fetchFields = vi.fn();

vi.mock("@app/tools/formFill/formApi", () => ({
  applyFieldEdits: (...args: unknown[]) => applyFieldEdits(...args),
}));
// Defined inside each factory: vi.mock is hoisted above any module-level binding.
vi.mock("@app/tools/formFill/providers/PdfBoxFormProvider", () => ({
  PdfBoxFormProvider: class {
    fetchFields(...args: unknown[]) {
      return fetchFields(...args);
    }
    fillForm() {
      return Promise.resolve(new Blob());
    }
  },
}));
vi.mock("@app/tools/formFill/providers/PdfiumFormProvider", () => ({
  PdfiumFormProvider: class {
    fetchFields(...args: unknown[]) {
      return fetchFields(...args);
    }
    fillForm() {
      return Promise.resolve(new Blob());
    }
  },
}));
vi.mock("@app/services/pdfiumService", () => ({
  fetchSignatureFieldsWithAppearances: vi.fn().mockResolvedValue([]),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FormFillProvider>{children}</FormFillProvider>
);

const blob = () => new Blob(["%PDF-1.4"], { type: "application/pdf" });

function result(skipped: FieldEditResult["skipped"]): FieldEditResult {
  return { blob: blob(), skipped, skippedTotal: skipped.length };
}

describe("FormFillContext staged-edit ownership", () => {
  beforeEach(() => {
    applyFieldEdits.mockReset();
    fetchFields.mockReset();
    fetchFields.mockResolvedValue([]);
  });

  it("keeps the skip report across the re-fetch a commit triggers", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });

    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.stageModification("f", { x: 1 }));

    applyFieldEdits.mockResolvedValue(
      result([
        {
          operation: "delete",
          target: "ghost",
          reason: "no field with that name exists",
        },
      ]),
    );
    await act(async () => {
      await hook.current.commitModifications(blob());
    });
    expect(hook.current.skippedEdits).toHaveLength(1);

    // Committing produces a NEW workbench file, so the viewer re-fetches under a new id.
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A-edited");
    });

    await waitFor(() => expect(hook.current.skippedEdits).toHaveLength(1));
  });

  it("drops edits staged against a different file", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });

    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.stageModification("f", { x: 1 }));
    expect(hook.current.hasUncommittedChanges).toBe(true);

    await act(async () => {
      await hook.current.fetchFields(blob(), "file-B");
    });

    await waitFor(() => expect(hook.current.hasUncommittedChanges).toBe(false));
  });

  it("drops them even when the new file's fetch fails", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });

    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.stageModification("f", { x: 1 }));

    fetchFields.mockRejectedValueOnce(new Error("corrupt PDF"));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-B");
    });

    await waitFor(() => expect(hook.current.hasUncommittedChanges).toBe(false));
  });

  it("keeps edits across a re-fetch of the same file", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });

    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.stageModification("f", { x: 1 }));

    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });

    expect(hook.current.hasUncommittedChanges).toBe(true);
  });

  it("drops the skip report once an unrelated document is opened", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });

    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.stageModification("f", { x: 1 }));

    applyFieldEdits.mockResolvedValue(
      result([
        {
          operation: "delete",
          target: "ghost",
          reason: "no field with that name exists",
        },
      ]),
    );
    await act(async () => {
      await hook.current.commitModifications(blob());
    });

    // The commit's own re-fetch keeps the report...
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A-edited");
    });
    expect(hook.current.skippedEdits).toHaveLength(1);

    // ...but opening a different document must not carry it over.
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-B-unrelated");
    });
    await waitFor(() => expect(hook.current.skippedEdits).toHaveLength(0));
    expect(hook.current.skippedTotal).toBe(0);
  });
});
