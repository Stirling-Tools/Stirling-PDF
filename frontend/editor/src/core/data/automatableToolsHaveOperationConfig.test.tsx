/**
 * Registry invariant: the Automate picker offers a tool whenever it doesn't opt out via
 * `supportsAutomate: false`, but automationExecutor resolves each step through the tool's
 * `operationConfig`. A tool that is offered without one is selectable in the builder and
 * only fails when the automation runs, with "Tool operation not supported: <toolId>".
 *
 * So a tool must either carry an operationConfig or declare supportsAutomate: false.
 */
import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import { getToolSupportsAutomate } from "@app/data/toolsTaxonomy";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { changeLanguage: vi.fn(), language: "en-US" },
  }),
  Trans: ({ children }: { children?: unknown }) => children,
}));

describe("automatable tools", () => {
  test("every tool offered to Automate can be executed as a step", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());

    const offeredWithoutConfig = Object.entries(result.current.regularTools)
      .filter(([, entry]) => entry && getToolSupportsAutomate(entry))
      .filter(([, entry]) => !entry.operationConfig)
      .map(([id]) => id);

    expect(offeredWithoutConfig).toEqual([]);
  });

  // Reorganize Pages has an automatable form (organization mode + page-order string) and a
  // context-free settings component, but its registry entry once left automationSettings null,
  // so both Automate and the pipeline builder showed "no configurable settings". Guard the wiring.
  test("Reorganize Pages exposes automation settings so it is configurable, not no-settings", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());

    expect(
      result.current.regularTools.reorganizePages?.automationSettings,
    ).toBeTruthy();
  });
});
