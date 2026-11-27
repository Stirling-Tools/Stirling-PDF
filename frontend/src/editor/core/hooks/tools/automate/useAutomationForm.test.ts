import { describe, expect, test } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { AutomationMode } from "@editor/types/automation";
import { useAutomationForm } from "@editor/hooks/tools/automate/useAutomationForm";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function ocrLikeRegistry(resolved: Promise<{ languages: string[] }>) {
  return {
    ocr: {
      name: "OCR",
      operationConfig: {
        defaultParameters: { languages: [] },
        validateParams: (p: { languages: string[] }) => p.languages.length > 0,
        resolveDefaultParameters: () => resolved,
      },
    },
  } as unknown as Partial<ToolRegistry>;
}

function renderForm(toolRegistry: Partial<ToolRegistry>) {
  return renderHook(() =>
    useAutomationForm({ mode: AutomationMode.CREATE, toolRegistry }),
  );
}

describe("useAutomationForm selectTool", () => {
  test("fills in a tool's resolved defaults without its settings being opened", async () => {
    const lookup = deferred<{ languages: string[] }>();
    const { result } = renderForm(ocrLikeRegistry(lookup.promise));

    act(() => result.current.selectTool(0, "ocr"));
    expect(
      result.current.isToolConfigured(result.current.selectedTools[0]),
    ).toBe(false);

    await act(async () => lookup.resolve({ languages: ["eng"] }));
    await waitFor(() =>
      expect(result.current.selectedTools[0].parameters).toEqual({
        languages: ["eng"],
      }),
    );
    expect(
      result.current.isToolConfigured(result.current.selectedTools[0]),
    ).toBe(true);
  });

  test("a settings save before the lookup returns is kept", async () => {
    const lookup = deferred<{ languages: string[] }>();
    const { result } = renderForm(ocrLikeRegistry(lookup.promise));

    act(() => result.current.selectTool(0, "ocr"));
    act(() =>
      result.current.updateTool(0, { parameters: { languages: ["fra"] } }),
    );
    await act(async () => lookup.resolve({ languages: ["eng"] }));

    expect(result.current.selectedTools[0].parameters).toEqual({
      languages: ["fra"],
    });
  });
});
