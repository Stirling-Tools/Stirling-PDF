/**
 * Classify (Rust) must be offered as a pipeline step. Each link below silently
 * drops it from the builder's picker rather than failing loudly: an endpoint
 * missing from the generated ToolEndpoint union, no request mappers, or no
 * PDF-in/PDF-out declaration to check a chain across.
 */
import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import { getExecutableTools } from "@app/hooks/tools/shared/toolAutomation";
import { isToolEndpoint } from "@app/hooks/tools/shared/toolApiMapping";
import { TOOL_IO } from "@app/types/toolIO";
import { CLASSIFY_RUST_ENDPOINT } from "@app/hooks/tools/classifyRust/useClassifyRustOperation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { changeLanguage: vi.fn(), language: "en-US" },
  }),
  Trans: ({ children }: { children?: unknown }) => children,
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

describe("classifyRust as a pipeline task", () => {
  test("its endpoint is a generated ToolEndpoint", () => {
    expect(isToolEndpoint(CLASSIFY_RUST_ENDPOINT)).toBe(true);
  });

  test("the builder offers it as a step that runs on the server", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());

    const step = getExecutableTools(result.current.regularTools).find(
      (tool) => tool.toolId === "classifyRust",
    );

    expect(step).toMatchObject({
      endpoint: CLASSIFY_RUST_ENDPOINT,
      support: "noSettings",
    });
  });

  test("it declares PDF in, PDF out, so a chain can be checked across it", () => {
    expect(TOOL_IO[CLASSIFY_RUST_ENDPOINT]).toEqual({
      accepts: ["PDF"],
      produces: "PDF",
      arity: "SISO",
    });
  });
});
