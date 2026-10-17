/** Registry invariant: the Automate picker offers a tool whenever it doesn't opt out via `supportsAutomate. */
import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import { withOperationConfigs } from "@app/data/toolOperationConfigs";
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
    const regularTools = withOperationConfigs(result.current.regularTools);

    const offeredWithoutConfig = Object.entries(regularTools)
      .filter(([, entry]) => entry && getToolSupportsAutomate(entry))
      .filter(([, entry]) => !entry.operationConfig)
      .map(([id]) => id);

    expect(offeredWithoutConfig).toEqual([]);
  });

  // The boot registry must not carry the configs: every module in OPERATION_CONFIGS pulls in a
  // tool's hooks, so one entry.config leaking back onto the startup path costs the whole family.
  test("the boot registry carries no operation configs", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());

    const withConfig = Object.entries(result.current.regularTools)
      .filter(([, entry]) => entry?.operationConfig)
      .map(([id]) => id);

    expect(withConfig).toEqual([]);
  });

// Reorganize Pages has an automatable form (organization mode + page-order string) and a context-free settings.
  test("Reorganize Pages exposes automation settings so it is configurable, not no-settings", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());

    expect(
      result.current.regularTools.reorganizePages?.automationSettings,
    ).toBeTruthy();
  });
});
