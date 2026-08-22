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

describe("FormFillContext bundled field list", () => {
  beforeEach(() => {
    applyFieldEdits.mockReset();
    fetchFields.mockReset();
    fetchFields.mockResolvedValue([]);
  });

  const bundled = [
    { name: "bundled", type: "text", widgets: [{ pageIndex: 0, x: 1, y: 2 }] },
  ] as unknown as FieldEditResult["fields"];

  async function commitWith(
    hook: { current: ReturnType<typeof useFormFill> },
    edited: Blob,
    fields: FieldEditResult["fields"],
  ) {
    // The viewer switches to pdfbox whenever the form tool is open, which is when commits happen.
    act(() => hook.current.setProviderMode("pdfbox"));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.stageModification("f", { x: 1 }));
    applyFieldEdits.mockResolvedValue({
      blob: edited,
      skipped: [],
      skippedTotal: 0,
      fields,
    });
    await act(async () => {
      await hook.current.commitModifications(blob());
    });
  }

  it("skips the follow-up request when the commit already returned the fields", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    const edited = blob();
    await commitWith(hook, edited, bundled);
    const callsBefore = fetchFields.mock.calls.length;

    await act(async () => {
      await hook.current.fetchFields(edited, "file-A-edited");
    });

    // The whole point: no second upload for the post-commit fetch.
    expect(fetchFields.mock.calls).toHaveLength(callsBefore);
    await waitFor(() =>
      expect(hook.current.state.fields.map((f) => f.name)).toEqual(["bundled"]),
    );
  });

  it("still asks the backend when the commit returned no fields", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    const edited = blob();
    await commitWith(hook, edited, undefined);
    const callsBefore = fetchFields.mock.calls.length;

    await act(async () => {
      await hook.current.fetchFields(edited, "file-A-edited");
    });

    expect(fetchFields.mock.calls.length).toBe(callsBefore + 1);
  });

  it("ignores a bundle whose size does not match the file being fetched", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await commitWith(hook, blob(), bundled);
    const callsBefore = fetchFields.mock.calls.length;

    // A different document must never adopt the previous commit's field list.
    await act(async () => {
      await hook.current.fetchFields(
        new Blob(["%PDF-1.4 a longer unrelated document"]),
        "file-B",
      );
    });

    expect(fetchFields.mock.calls.length).toBe(callsBefore + 1);
  });

  it("does not reuse the bundle for a second fetch", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    const edited = blob();
    await commitWith(hook, edited, bundled);

    await act(async () => {
      await hook.current.fetchFields(edited, "file-A-edited");
    });
    const afterFirst = fetchFields.mock.calls.length;
    await act(async () => {
      await hook.current.fetchFields(edited, "file-A-edited");
    });

    expect(fetchFields.mock.calls.length).toBe(afterFirst + 1);
  });
});
