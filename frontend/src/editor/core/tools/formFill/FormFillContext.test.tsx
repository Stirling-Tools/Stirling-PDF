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
  useAllFormValues,
} from "@editor/tools/formFill/FormFillContext";
import type { FieldEditResult } from "@editor/tools/formFill/types";

const applyFieldEdits = vi.fn();
const fetchFields = vi.fn();

vi.mock("@editor/tools/formFill/formApi", () => ({
  applyFieldEdits: (...args: unknown[]) => applyFieldEdits(...args),
}));
// Defined inside each factory: vi.mock is hoisted above any module-level binding.
vi.mock("@editor/tools/formFill/providers/PdfBoxFormProvider", () => ({
  PdfBoxFormProvider: class {
    fetchFields(...args: unknown[]) {
      return fetchFields(...args);
    }
    fillForm() {
      return Promise.resolve(new Blob());
    }
  },
}));
vi.mock("@editor/tools/formFill/providers/PdfiumFormProvider", () => ({
  PdfiumFormProvider: class {
    fetchFields(...args: unknown[]) {
      return fetchFields(...args);
    }
    fillForm() {
      return Promise.resolve(new Blob());
    }
  },
}));
vi.mock("@editor/services/pdfiumService", () => ({
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
      await hook.current.commitDesign(blob(), (updated) =>
        hook.current.fetchFields(updated, "file-A-edited"),
      );
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
      await hook.current.commitDesign(blob(), (updated) =>
        hook.current.fetchFields(updated, "file-A-edited"),
      );
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

describe("FormFillContext shared design draft", () => {
  beforeEach(() => {
    applyFieldEdits.mockReset();
    fetchFields.mockReset();
    fetchFields.mockResolvedValue([]);
  });

  it("retains both design tabs and saves adds, modifications and deletions together", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.setMode("create"));
    act(() =>
      hook.current.addPendingField({
        type: "text",
        name: "new",
        pageIndex: 0,
        x: 1,
        y: 2,
        width: 100,
        height: 20,
      }),
    );
    act(() => hook.current.setMode("modify"));
    act(() => hook.current.stageModification("existing", { label: "Renamed" }));
    act(() => hook.current.stageModification("deleted", { label: "Ignored" }));
    act(() => hook.current.toggleFieldDeleted("deleted"));
    act(() => hook.current.setMode("create"));
    expect(hook.current.pendingFields).toHaveLength(1);
    expect(hook.current.modifiedFields.existing.label).toBe("Renamed");
    applyFieldEdits.mockResolvedValue(result([]));
    let finish!: () => void;
    const persisted = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const apply = vi.fn(() => persisted);
    let saving!: Promise<void>;
    act(() => {
      saving = hook.current.commitDesign(blob(), apply);
    });
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(hook.current.hasUncommittedChanges).toBe(true);
    expect(applyFieldEdits.mock.calls[0][1]).toEqual({
      add: [expect.objectContaining({ name: "new" })],
      modify: [{ targetName: "existing", label: "Renamed" }],
      delete: ["deleted"],
    });
    await act(async () => {
      finish();
      await saving;
    });
    expect(hook.current.hasUncommittedChanges).toBe(false);
    expect(hook.current.canUndo).toBe(false);
  });

  it("keeps the draft and undo history when persistence fails", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() =>
      hook.current.stageModification("existing", { label: "Retry me" }),
    );
    applyFieldEdits.mockResolvedValue(result([]));
    await act(async () => {
      await expect(
        hook.current.commitDesign(blob(), async () => {
          throw new Error("Storage failed");
        }),
      ).rejects.toThrow("Storage failed");
    });
    expect(hook.current.modifiedFields.existing.label).toBe("Retry me");
    expect(hook.current.canUndo).toBe(true);
    act(() => hook.current.discardDesign());
    expect(hook.current.hasUncommittedChanges).toBe(false);
    expect(hook.current.canUndo).toBe(false);
  });

  it("does not reapply edits already persisted when the preview fails to reopen", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.stageModification("existing", { label: "Saved" }));
    applyFieldEdits.mockResolvedValue(result([]));
    await act(async () => {
      await expect(
        hook.current.commitDesign(blob(), async (updated) => {
          await hook.current.fetchFields(updated, "file-A-edited");
          throw new Error("Preview failed");
        }),
      ).rejects.toThrow("Preview failed");
    });
    expect(hook.current.hasUncommittedChanges).toBe(false);
    expect(hook.current.canUndo).toBe(false);
  });

  it("uses a bundled field list during persistence and never reuses it afterwards", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    act(() => hook.current.setProviderMode("pdfbox"));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.stageModification("existing", { label: "Renamed" }));
    const fields = [{ name: "bundled", type: "text", value: "", widgets: [] }];
    applyFieldEdits.mockResolvedValue({ ...result([]), fields });
    const before = fetchFields.mock.calls.length;
    await act(async () => {
      await hook.current.commitDesign(blob(), (updated) =>
        hook.current.fetchFields(updated, "file-A-edited"),
      );
    });
    expect(fetchFields).toHaveBeenCalledTimes(before);
    expect(hook.current.state.fields).toEqual(fields);
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A-edited");
    });
    expect(fetchFields).toHaveBeenCalledTimes(before + 1);
  });
});

describe("FormFillContext value retention", () => {
  it("does not mark filled values clean before the PDF is persisted", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.setValue("who", "Ada"));
    await act(async () => {
      await hook.current.submitForm(blob());
    });
    expect(hook.current.state.isDirty).toBe(true);
    act(() => hook.current.discardValues());
    expect(hook.current.getValue("who")).toBe("");
    expect(hook.current.state.isDirty).toBe(false);
  });

  it("updates value subscribers on every edit", () => {
    const { result: hook } = renderHook(
      () => ({ form: useFormFill(), values: useAllFormValues() }),
      { wrapper },
    );
    act(() => hook.current.form.setValue("who", "Ada"));
    act(() => hook.current.form.setValue("who", "Grace"));
    expect(hook.current.values.who).toBe("Grace");
  });

  beforeEach(() => {
    applyFieldEdits.mockReset();
    fetchFields.mockReset();
    fetchFields.mockResolvedValue([
      { name: "who", type: "text", value: "", widgets: [{ pageIndex: 0 }] },
    ]);
  });

  it("keeps what the user typed when the same file is re-fetched", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.setValue("who", "Ada"));
    expect(hook.current.getValue("who")).toBe("Ada");

    // Opening the form tool switches provider, which re-fetches the very same document.
    act(() => hook.current.setProviderMode("pdfbox"));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });

    expect(hook.current.getValue("who")).toBe("Ada");
  });

  it("drops retained values when a different document is opened", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.setValue("who", "Ada"));

    await act(async () => {
      await hook.current.fetchFields(blob(), "file-B");
    });

    expect(hook.current.getValue("who")).toBe("");
  });

  it("does not report unsaved changes when nothing was typed", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });

    act(() => hook.current.setProviderMode("pdfbox"));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });

    // A sticky dirty flag makes the leave-page warning fire on every navigation.
    expect(hook.current.state.isDirty).toBe(false);
  });

  it("still reports unsaved changes when something was typed", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    act(() => hook.current.setValue("who", "Ada"));

    act(() => hook.current.setProviderMode("pdfbox"));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });

    expect(hook.current.state.isDirty).toBe(true);
  });
});
