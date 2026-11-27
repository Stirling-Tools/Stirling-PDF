import { describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  isToolReadyWithParameters,
  useAutomationForm,
} from "@editor/hooks/tools/automate/useAutomationForm";
import {
  AutomationMode,
  type AutomationConfig,
} from "@editor/types/automation";
import type {
  ToolRegistry,
  ToolRegistryEntry,
} from "@editor/data/toolsTaxonomy";
import {
  asRegistryConfig,
  type RegistryToolOperationConfig,
} from "@editor/hooks/tools/shared/toolOperationTypes";
import { compressOperationConfig } from "@editor/hooks/tools/compress/useCompressOperation";
import { addPasswordOperationConfig } from "@editor/hooks/tools/addPassword/useAddPasswordOperation";
import { flattenOperationConfig } from "@editor/hooks/tools/flatten/useFlattenOperation";

const { translate } = vi.hoisted(() => ({
  translate: (key: string, fallback?: string) => fallback ?? key,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}));

const Settings = () => null;

function entry(
  operationConfig: RegistryToolOperationConfig | undefined,
  withSettings = true,
): ToolRegistryEntry {
  return {
    icon: null,
    name: "tool",
    component: null,
    description: "",
    categoryId: "standardTools",
    subcategoryId: "general",
    operationConfig,
    automationSettings: withSettings ? Settings : null,
  } as unknown as ToolRegistryEntry;
}

const registry: Partial<ToolRegistry> = {
  compress: entry(asRegistryConfig(compressOperationConfig)),
  flatten: entry(asRegistryConfig(flattenOperationConfig)),
  addPassword: entry(asRegistryConfig(addPasswordOperationConfig)),
};

function defaults(config: RegistryToolOperationConfig) {
  return { ...config.defaultParameters };
}

describe("isToolReadyWithParameters", () => {
  test("a tool without settings is ready", () => {
    expect(isToolReadyWithParameters(entry(undefined, false), {})).toBe(true);
  });

  test("a tool with settings and no validator is ready on its defaults", () => {
    expect(isToolReadyWithParameters(entry(undefined), {})).toBe(true);
  });

  test("compress defaults pass its validator", () => {
    const config = asRegistryConfig(compressOperationConfig);
    expect(isToolReadyWithParameters(entry(config), defaults(config))).toBe(
      true,
    );
  });

  test("add password defaults fail its validator", () => {
    const config = asRegistryConfig(addPasswordOperationConfig);
    expect(isToolReadyWithParameters(entry(config), defaults(config))).toBe(
      false,
    );
  });
});

const suggested: AutomationConfig = {
  id: "s",
  name: "Suggested",
  operations: [
    { operation: "compress", parameters: {} },
    { operation: "addPassword", parameters: {} },
  ],
  createdAt: "",
  updatedAt: "",
};

describe("useAutomationForm", () => {
  test("tools added with valid defaults can be saved without configuring", () => {
    const { result } = renderHook(() =>
      useAutomationForm({
        mode: AutomationMode.CREATE,
        toolRegistry: registry,
      }),
    );

    act(() => {
      result.current.setAutomationName("Flatten then compress");
      result.current.setSelectedTools([]);
    });
    act(() => result.current.addTool("flatten"));
    act(() => result.current.addTool("compress"));

    expect(result.current.selectedTools.map((t) => t.configured)).toEqual([
      true,
      true,
    ]);
    expect(result.current.canSaveAutomation()).toBe(true);
  });

  test("a tool whose defaults are invalid still blocks saving", () => {
    const { result } = renderHook(() =>
      useAutomationForm({
        mode: AutomationMode.CREATE,
        toolRegistry: registry,
      }),
    );

    act(() => result.current.setAutomationName("Protect"));
    act(() => result.current.addTool("addPassword"));

    const added = result.current.selectedTools.at(-1);
    expect(added?.configured).toBe(false);
    expect(result.current.canSaveAutomation()).toBe(false);
  });

  test("suggested automations mark only steps with invalid defaults as unconfigured", () => {
    const { result } = renderHook(() =>
      useAutomationForm({
        mode: AutomationMode.SUGGESTED,
        toolRegistry: registry,
        existingAutomation: suggested,
      }),
    );

    expect(result.current.selectedTools.map((t) => t.configured)).toEqual([
      true,
      false,
    ]);
  });
});
