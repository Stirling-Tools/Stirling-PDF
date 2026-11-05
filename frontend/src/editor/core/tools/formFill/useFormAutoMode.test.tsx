import React, { useEffect } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FormFillProvider,
  useFormFill,
} from "@editor/tools/formFill/FormFillContext";
import { useFormAutoMode } from "@editor/tools/formFill/useFormAutoMode";
import type { FormField } from "@editor/tools/formFill/types";

const { fetchBackend } = vi.hoisted(() => ({ fetchBackend: vi.fn() }));
vi.mock("@editor/tools/formFill/providers/PdfBoxFormProvider", () => ({
  PdfBoxFormProvider: class {
    name = "pdfbox";
    fetchFields = fetchBackend;
  },
}));
vi.mock("@editor/tools/formFill/providers/PdfiumFormProvider", () => ({
  PdfiumFormProvider: class {
    name = "pdfium";
    async fetchFields() {
      return [];
    }
  },
}));
vi.mock("@editor/tools/formFill/formApi", () => ({ applyFieldEdits: vi.fn() }));
vi.mock("@editor/services/pdfiumService", () => ({
  fetchSignatureFieldsWithAppearances: vi.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FormFillProvider>{children}</FormFillProvider>
);
const file = new Blob(["pdf"]);
const field: FormField = {
  name: "name",
  label: "Name",
  type: "text",
  value: "",
  options: null,
  displayOptions: null,
  required: false,
  readOnly: false,
  multiSelect: false,
  multiline: false,
  tooltip: null,
  widgets: [],
};

describe("automatic form tab selection", () => {
  beforeEach(() => {
    fetchBackend.mockReset();
  });

  it.each([true, false])(
    "waits for PDFBox on entry even when viewer effect runs first: %s",
    async (viewerFirst) => {
      let finish!: (fields: FormField[]) => void;
      fetchBackend.mockImplementation(
        () =>
          new Promise<FormField[]>((resolve) => {
            finish = resolve;
          }),
      );
      const { result, rerender } = renderHook(
        ({ active }) => {
          const form = useFormFill();
          const switchProvider = () => {
            if (active) {
              form.setProviderMode("pdfbox");
              void form.fetchFields(file, "A");
            }
          };
          useEffect(() => {
            if (viewerFirst) switchProvider();
          }, [active]);
          useFormAutoMode("A", active);
          useEffect(() => {
            if (!viewerFirst) switchProvider();
          }, [active]);
          return form;
        },
        { wrapper, initialProps: { active: false } },
      );
      await act(async () => {
        await result.current.fetchFields(file, "A");
      });
      rerender({ active: true });
      expect(result.current.state.loading).toBe(true);
      expect(result.current.mode).toBe("fill");
      await act(async () => finish([field]));
      expect(result.current.state.fields).toEqual([field]);
      expect(result.current.mode).toBe("fill");
    },
  );

  it("selects Create immediately after a successful empty PDFBox result", async () => {
    fetchBackend.mockResolvedValue([]);
    const { result } = renderHook(
      () => {
        useFormAutoMode("A", true);
        return useFormFill();
      },
      { wrapper },
    );
    act(() => result.current.setProviderMode("pdfbox"));
    await act(async () => {
      await result.current.fetchFields(file, "A");
    });
    expect(result.current.mode).toBe("create");
    act(() => result.current.setMode("fill"));
    expect(result.current.mode).toBe("fill");
  });

  it("ignores a completed result for a different file", async () => {
    fetchBackend.mockResolvedValue([]);
    const { result } = renderHook(
      () => {
        useFormAutoMode("B", true);
        return useFormFill();
      },
      { wrapper },
    );
    act(() => result.current.setProviderMode("pdfbox"));
    await act(async () => {
      await result.current.fetchFields(file, "A");
    });
    expect(result.current.mode).toBe("fill");
    await act(async () => {
      await result.current.fetchFields(file, "B");
    });
    expect(result.current.mode).toBe("create");
  });

  it("does not treat a failed fetch as an empty form", async () => {
    fetchBackend.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(
      () => {
        useFormAutoMode("A", true);
        return useFormFill();
      },
      { wrapper },
    );
    act(() => result.current.setProviderMode("pdfbox"));
    await act(async () => {
      await result.current.fetchFields(file, "A");
    });
    expect(result.current.state.error).toBe("offline");
    expect(result.current.mode).toBe("fill");
  });
});
