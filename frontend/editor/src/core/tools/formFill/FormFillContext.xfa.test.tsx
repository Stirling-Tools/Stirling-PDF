/**
 * The viewer fills with PDFium in the browser, which leaves a hybrid form's XFA stale, so its save
 * goes through the backend sync; structural commits carry the chosen mode to the backend instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import {
  FormFillProvider,
  useFormFill,
} from "@app/tools/formFill/FormFillContext";
import type { FormField } from "@app/tools/formFill/types";
import { expectConsole } from "@app/tests/failOnConsole";

const applyFieldEdits = vi.fn();
const syncXfaForm = vi.fn();
const fetchFields = vi.fn();
const readFormType = vi.fn();
const filled = new Blob(["filled by pdfium"], { type: "application/pdf" });

vi.mock("@app/tools/formFill/formApi", () => ({
  applyFieldEdits: (...args: unknown[]) => applyFieldEdits(...args),
  syncXfaForm: (...args: unknown[]) => syncXfaForm(...args),
}));
// Defined inside each factory: vi.mock is hoisted above any module-level binding.
vi.mock("@app/tools/formFill/providers/PdfBoxFormProvider", () => ({
  PdfBoxFormProvider: class {
    fetchFields(...args: unknown[]) {
      return fetchFields(...args);
    }
    fillForm() {
      return Promise.resolve(new Blob(["filled by pdfbox"]));
    }
  },
}));
vi.mock("@app/tools/formFill/providers/PdfiumFormProvider", () => ({
  PdfiumFormProvider: class {
    fetchFields(...args: unknown[]) {
      return fetchFields(...args);
    }
    fillForm() {
      return Promise.resolve(filled);
    }
  },
}));
vi.mock("@app/services/pdfiumService", () => ({
  fetchSignatureFieldsWithAppearances: vi.fn().mockResolvedValue([]),
}));
vi.mock("@app/tools/formFill/xfa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/tools/formFill/xfa")>()),
  readFormType: (...args: unknown[]) => readFormType(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FormFillProvider>{children}</FormFillProvider>
);

const source = () => new Blob(["%PDF-1.7"], { type: "application/pdf" });
const otherDocument = () =>
  new Blob(["%PDF-1.7 a different form"], { type: "application/pdf" });

function field(name: string, value = ""): FormField {
  return {
    name,
    label: name,
    type: "text",
    value,
    options: null,
    displayOptions: null,
    required: false,
    readOnly: false,
    multiSelect: false,
    multiline: false,
    tooltip: null,
    widgets: null,
  };
}

async function openForm(fields: FormField[]) {
  fetchFields.mockResolvedValue(fields);
  const { result } = renderHook(() => useFormFill(), { wrapper });
  await act(async () => {
    await result.current.fetchFields(source(), "file-A");
  });
  return result;
}

describe("FormFillContext XFA handling", () => {
  beforeEach(() => {
    applyFieldEdits.mockReset();
    syncXfaForm.mockReset();
    fetchFields.mockReset();
    readFormType.mockReset();
    readFormType.mockResolvedValue(3);
  });

  it("sends a viewer save of a hybrid form through the XFA sync", async () => {
    const synced = new Blob(["synced"], { type: "application/pdf" });
    syncXfaForm.mockResolvedValue({ blob: synced, summary: {} });
    const hook = await openForm([field("a"), field("b", "kept")]);
    act(() => hook.current.setValue("a", "typed"));

    let saved: Blob | undefined;
    await act(async () => {
      saved = await hook.current.submitForm(source());
    });

    expect(saved).toBe(synced);
    expect(syncXfaForm).toHaveBeenCalledWith(filled, "sync", ["a"]);
  });

  it("strips the XFA instead when the save flattens the form", async () => {
    syncXfaForm.mockResolvedValue({ blob: new Blob(), summary: {} });
    const hook = await openForm([field("a")]);

    await act(async () => {
      await hook.current.submitForm(source(), true);
    });

    expect(syncXfaForm).toHaveBeenCalledWith(filled, "strip", []);
  });

  it("keeps PDFium's output untouched when the user chose to leave the XFA", async () => {
    const hook = await openForm([field("a")]);
    act(() => hook.current.setXfaMode("none"));

    let saved: Blob | undefined;
    await act(async () => {
      saved = await hook.current.submitForm(source());
    });

    expect(saved).toBe(filled);
    expect(syncXfaForm).not.toHaveBeenCalled();
  });

  it("makes no extra request for a PDF without XFA", async () => {
    readFormType.mockResolvedValue(1);
    const hook = await openForm([field("a")]);

    let saved: Blob | undefined;
    await act(async () => {
      saved = await hook.current.submitForm(source());
    });

    expect(saved).toBe(filled);
    expect(syncXfaForm).not.toHaveBeenCalled();
  });

  it("keeps the unsynced PDF and flags it when the sync fails", async () => {
    expectConsole.warn(/\[FormFill\] XFA sync failed/);
    syncXfaForm.mockRejectedValue(new Error("404"));
    const hook = await openForm([field("a")]);

    let saved: Blob | undefined;
    await act(async () => {
      saved = await hook.current.submitForm(source());
    });

    expect(saved).toBe(filled);
    expect(hook.current.xfaSyncFailed).toBe(true);
  });

  it("keeps a failed-sync notice for the saved version, not for another document", async () => {
    expectConsole.warn(/\[FormFill\] XFA sync failed/);
    syncXfaForm.mockRejectedValue(new Error("404"));
    const hook = await openForm([field("a")]);
    let saved: Blob | undefined;
    await act(async () => {
      saved = await hook.current.submitForm(source());
    });

    // The viewer reloads the saved PDF under a new file id.
    await act(async () => {
      await hook.current.fetchFields(saved!, "file-A-saved");
    });
    expect(hook.current.xfaSyncFailed).toBe(true);

    await act(async () => {
      await hook.current.fetchFields(otherDocument(), "file-B");
    });
    expect(hook.current.xfaSyncFailed).toBe(false);
  });

  it("keeps the chosen mode for the saved version and resets it for another document", async () => {
    const hook = await openForm([field("a")]);
    act(() => hook.current.setXfaMode("none"));
    let saved: Blob | undefined;
    await act(async () => {
      saved = await hook.current.submitForm(source());
    });

    await act(async () => {
      await hook.current.fetchFields(saved!, "file-A-saved");
    });
    expect(hook.current.xfaMode).toBe("none");

    await act(async () => {
      await hook.current.fetchFields(otherDocument(), "file-B");
    });
    expect(hook.current.xfaMode).toBe("sync");
  });

  it("keeps the chosen mode across the reload that follows a structural commit", async () => {
    const committed = new Blob(["%PDF-1.7 with the committed fields"]);
    applyFieldEdits.mockResolvedValue({
      blob: committed,
      skipped: [],
      skippedTotal: 0,
    });
    const hook = await openForm([field("a")]);
    act(() => hook.current.setXfaMode("none"));
    act(() => hook.current.stageModification("a", { x: 1 }));

    await act(async () => {
      await hook.current.commitModifications(source());
    });
    await act(async () => {
      await hook.current.fetchFields(committed, "file-A-committed");
    });

    expect(hook.current.xfaMode).toBe("none");
  });

  it("sends the chosen mode with structural commits", async () => {
    applyFieldEdits.mockResolvedValue({
      blob: new Blob(),
      skipped: [],
      skippedTotal: 0,
    });
    const hook = await openForm([field("a")]);
    act(() => hook.current.setXfaMode("none"));
    act(() => hook.current.stageModification("a", { x: 1 }));

    await act(async () => {
      await hook.current.commitModifications(source());
    });

    expect(applyFieldEdits).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "none",
    );
  });
});
