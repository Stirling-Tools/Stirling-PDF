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
import { PdfBoxFormProvider } from "@app/tools/formFill/providers/PdfBoxFormProvider";
import type { FieldEditResult, FormField } from "@app/tools/formFill/types";
import { allowConsole } from "@app/tests/failOnConsole";

const applyFieldEdits = vi.fn();
const fetchFields =
  vi.fn<
    (
      file: File | Blob,
      options?: { pageIndices?: number[] },
    ) => Promise<FormField[]>
  >();

vi.mock("@app/tools/formFill/formApi", () => ({
  applyFieldEdits: (...args: unknown[]) => applyFieldEdits(...args),
}));
// Defined inside each factory: vi.mock is hoisted above any module-level binding.
vi.mock("@app/tools/formFill/providers/PdfBoxFormProvider", () => ({
  PdfBoxFormProvider: class {
    readonly name = "pdfbox";
    fetchFields(file: File | Blob, options?: { pageIndices?: number[] }) {
      return fetchFields(file, options);
    }
    fillForm() {
      return Promise.resolve(new Blob());
    }
  },
}));
vi.mock("@app/tools/formFill/providers/PdfiumFormProvider", () => ({
  PdfiumFormProvider: class {
    readonly name = "pdflib";
    fetchFields(file: File | Blob, options?: { pageIndices?: number[] }) {
      return fetchFields(file, options);
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

const pdfboxWrapper = ({ children }: { children: React.ReactNode }) => (
  <FormFillProvider provider={new PdfBoxFormProvider()}>
    {children}
  </FormFillProvider>
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

describe("FormFillContext value retention", () => {
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

describe("FormFillContext per-page loading", () => {
  beforeEach(() => {
    applyFieldEdits.mockReset();
    fetchFields.mockReset();
    fetchFields.mockResolvedValue([]);
  });

  const pageField = (name: string, pageIndex: number): FormField[] => [
    {
      name,
      label: name,
      type: "text",
      value: "",
      options: null,
      displayOptions: null,
      required: false,
      readOnly: false,
      multiSelect: false,
      multiline: false,
      tooltip: null,
      widgets: [{ pageIndex, x: 1, y: 2, width: 10, height: 10 }],
    },
  ];

  it("merges on-demand page fields without dropping page 0", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    fetchFields.mockResolvedValueOnce(pageField("first", 0));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    fetchFields.mockResolvedValueOnce(pageField("fifth", 5));
    await act(async () => {
      await hook.current.ensurePageFields?.(5);
    });

    expect(hook.current.state.fields.map((f) => f.name).sort()).toEqual([
      "fifth",
      "first",
    ]);
  });

  it("does not page-fetch when the provider answers with the whole document", async () => {
    const { result: hook } = renderHook(() => useFormFill(), {
      wrapper: pdfboxWrapper,
    });
    fetchFields.mockResolvedValueOnce(pageField("first", 0));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    expect(fetchFields).toHaveBeenCalledTimes(1);

    await act(async () => {
      await hook.current.ensurePageFields?.(3);
    });
    // pdfbox returns everything in one response, so a page request would be a
    // second full backend fetch.
    expect(fetchFields).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded fields when a save-time full load fails, and retries", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    fetchFields.mockResolvedValueOnce(pageField("first", 0));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });

    fetchFields.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await hook.current.ensureAllFields?.();
    });
    expect(hook.current.state.fields.map((f) => f.name)).toEqual(["first"]);

    fetchFields.mockResolvedValueOnce([
      ...pageField("first", 0),
      ...pageField("second", 2),
    ]);
    await act(async () => {
      await hook.current.ensureAllFields?.();
    });
    expect(hook.current.state.fields.map((f) => f.name).sort()).toEqual([
      "first",
      "second",
    ]);
  });

  it("waits for the initial fetch before loading a page", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    let resolveInitial!: (fields: FormField[]) => void;
    fetchFields.mockReturnValueOnce(
      new Promise<FormField[]>((resolve) => {
        resolveInitial = resolve;
      }),
    );
    let initial!: Promise<void>;
    act(() => {
      initial = hook.current.fetchFields(blob(), "file-A");
    });
    fetchFields.mockResolvedValueOnce(pageField("third", 3));
    let page!: Promise<void>;
    act(() => {
      page = hook.current.ensurePageFields?.(3) ?? Promise.resolve();
    });
    expect(fetchFields).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitial(pageField("first", 0));
      await initial;
      await page;
    });
    expect(fetchFields).toHaveBeenCalledTimes(2);
    expect(fetchFields.mock.calls[1][1]).toEqual({ pageIndices: [3] });
    expect(hook.current.state.fields.map((f) => f.name).sort()).toEqual([
      "first",
      "third",
    ]);
  });

  it("initialises values for a field that arrives with its page", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    fetchFields.mockResolvedValueOnce(pageField("first", 0));
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    fetchFields.mockResolvedValueOnce([
      { ...pageField("prefilled", 4)[0], value: "hello" },
    ]);
    await act(async () => {
      await hook.current.ensurePageFields?.(4);
    });

    expect(hook.current.getValue("prefilled")).toBe("hello");
  });

  it("keeps same-origin widgets apart and orders them by page", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    fetchFields.mockResolvedValueOnce([
      {
        ...pageField("group", 0)[0],
        widgets: [{ pageIndex: 0, x: 1, y: 2, width: 10, height: 10 }],
      },
    ]);
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    fetchFields.mockResolvedValueOnce([
      {
        ...pageField("group", 5)[0],
        widgets: [{ pageIndex: 5, x: 1, y: 2, width: 20, height: 20 }],
      },
    ]);
    await act(async () => {
      await hook.current.ensurePageFields?.(5);
    });
    fetchFields.mockResolvedValueOnce([
      {
        ...pageField("group", 2)[0],
        widgets: [{ pageIndex: 2, x: 1, y: 2, width: 20, height: 20 }],
      },
    ]);
    await act(async () => {
      await hook.current.ensurePageFields?.(2);
    });

    const widgets = hook.current.state.fields[0].widgets ?? [];
    expect(widgets).toHaveLength(3);
    expect(widgets.map((w) => w.pageIndex)).toEqual([0, 2, 5]);
  });

  it("discards a per-page load that resolves after a file switch", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    let resolveSlow!: (v: FormField[]) => void;
    fetchFields.mockReturnValueOnce(
      new Promise<FormField[]>((resolve) => {
        resolveSlow = resolve;
      }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = hook.current.ensurePageFields?.(3) ?? Promise.resolve();
    });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-B");
    });
    await act(async () => {
      resolveSlow(pageField("stale", 3));
      await pending;
    });

    expect(hook.current.state.fields.map((f) => f.name)).not.toContain("stale");
  });

  it("retries a failed per-page load on the next request", async () => {
    allowConsole.warn(/Failed to load fields for page/);
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    const callsBefore = fetchFields.mock.calls.length;
    fetchFields.mockRejectedValueOnce(new Error("transient"));
    await act(async () => {
      await hook.current.ensurePageFields?.(2);
    });
    fetchFields.mockResolvedValueOnce(pageField("second", 2));
    await act(async () => {
      await hook.current.ensurePageFields?.(2);
    });

    expect(fetchFields.mock.calls.length).toBe(callsBefore + 2);
    expect(hook.current.state.fields.map((f) => f.name)).toContain("second");
  });

  it("ensureAllFields fetches exhaustively once, then short-circuits", async () => {
    const { result: hook } = renderHook(() => useFormFill(), { wrapper });
    await act(async () => {
      await hook.current.fetchFields(blob(), "file-A");
    });
    const callsBefore = fetchFields.mock.calls.length;
    await act(async () => {
      await hook.current.ensureAllFields?.();
    });

    const exhaustiveCalls = fetchFields.mock.calls.slice(callsBefore).filter(
      // Provider-level fetchFields(file, options): an exhaustive fetch is the
      // one that drops the page-0 filter so every page is scanned.
      (args) =>
        (args[1] as { pageIndices?: number[] } | undefined)?.pageIndices ===
        undefined,
    );
    expect(exhaustiveCalls.length).toBe(1);

    await act(async () => {
      await hook.current.ensureAllFields?.();
    });
    expect(fetchFields.mock.calls.length).toBe(callsBefore + 1);
  });
});
