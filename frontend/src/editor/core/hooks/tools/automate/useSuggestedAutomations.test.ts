import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { type ToolId } from "@editor/types/toolId";
import { useTranslatedToolCatalog } from "@editor/data/useTranslatedToolRegistry";
import { toolParamsNeedConfiguring } from "@editor/hooks/tools/shared/toolAutomation";
import { useSuggestedAutomations } from "@editor/hooks/tools/automate/useSuggestedAutomations";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { changeLanguage: vi.fn(), language: "en-US" },
  }),
  Trans: ({ children }: { children?: unknown }) => children,
}));

describe("useSuggestedAutomations", () => {
  const registry = renderHook(() => useTranslatedToolCatalog()).result.current
    .allTools;
  const { result } = renderHook(() => useSuggestedAutomations());
  const steps = result.current.flatMap((automation) =>
    automation.operations.map((op) => ({ automation: automation.id, ...op })),
  );

  // The run screen refuses a step its tool would reject, so a suggestion that drifts from its
  // tool's parameters would be offered and then never runnable.
  test.each(steps)(
    "$automation: $operation is runnable as suggested",
    ({ operation, parameters }) => {
      expect(registry[operation as ToolId]?.operationConfig).toBeDefined();
      expect(
        toolParamsNeedConfiguring(operation as ToolId, parameters, registry),
      ).toBe(false);
    },
  );
});
