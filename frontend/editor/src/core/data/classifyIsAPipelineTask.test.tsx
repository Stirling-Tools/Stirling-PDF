/**
 * Classification is a thing a pipeline can do, not a thing only the Classification policy may do.
 *
 * The chain that used to stop it: `getExecutableTools` drops any tool whose endpoint is not a
 * member of the generated `ToolEndpoint` union; that union comes from the OpenAPI spec, gated by
 * the generator's namespace allowlist; and the classify controller was `@Hidden`, so it never
 * reached the spec at all. These tests pin each link, because any one of them silently removes the
 * step from the builder's picker rather than failing loudly.
 */
import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import { getExecutableTools } from "@app/hooks/tools/shared/toolAutomation";
import { isToolEndpoint } from "@app/hooks/tools/shared/toolApiMapping";
import { TOOL_IO } from "@app/types/toolIO";
import { filterToolRegistryByQuery } from "@app/utils/toolSearch";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { changeLanguage: vi.fn(), language: "en-US" },
  }),
  Trans: ({ children }: { children?: unknown }) => children,
}));

const CLASSIFY_ENDPOINT = "/api/v1/ai/tools/classify-and-label";

describe("classify as a pipeline task", () => {
  test("the classify endpoint is a generated ToolEndpoint", () => {
    // Fails if the controller goes back to @Hidden, or the generator's allowlist drops the
    // /api/v1/ai/tools/ namespace, or nobody regenerated after either.
    expect(isToolEndpoint(CLASSIFY_ENDPOINT)).toBe(true);
  });

  test("the builder offers it as a step", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());

    const executable = getExecutableTools(result.current.regularTools);
    const classify = executable.find((tool) => tool.toolId === "classify");

    expect(classify).toBeDefined();
    expect(classify?.endpoint).toBe(CLASSIFY_ENDPOINT);
  });

  test("it declares PDF in, PDF out, so a chain can be checked across it", () => {
    // Without this the builder shows "Can't check what this step accepts" and validation stops
    // dead at the step - the I/O table is keyed by endpoint and comes from @ToolIO in the spec.
    expect(TOOL_IO[CLASSIFY_ENDPOINT]).toEqual({
      accepts: ["PDF"],
      produces: "PDF",
      arity: "SISO",
    });
  });

  test("it is offered to pipelines but kept out of the editor's tool list", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());

    // There is no interactive classify tool to open - it only means something inside a pipeline.
    expect(result.current.regularTools.classify?.hiddenFromToolList).toBe(true);
    expect(
      filterToolRegistryByQuery(result.current.regularTools, "").some(
        (ranked) => ranked.item[0] === "classify",
      ),
    ).toBe(false);
  });

  test("it does not re-classify by default", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());

    const config = result.current.regularTools.classify?.operationConfig;

    // The step is idempotent unless asked otherwise: a second run on a classified document
    // would be a second engine call, and a second charge, for the same answer.
    expect(config?.defaultParameters).toEqual({ reclassify: false });
  });
});
