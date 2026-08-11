import { describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import { ProcessorTestProviders } from "@processor/test/TestQueryProvider";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { WorkingToolStep } from "@app/hooks/tools/shared/toolAutomation";
import {
  asRegistryConfig,
  type ErasedToolParams,
  type ToolAutomationSettingsProps,
} from "@app/hooks/tools/shared/toolOperationTypes";
import ConvertSettings from "@app/components/tools/convert/ConvertSettings";
import { convertOperationConfig } from "@app/hooks/tools/convert/useConvertOperation";
import { defaultParameters as convertDefaults } from "@app/hooks/tools/convert/useConvertParameters";
import { PipelineStepSettings } from "@processor/components/pipelines/PipelineStepSettings";

// Override only useTranslation; keep the rest of react-i18next (initReactI18next et al.) real, so
// the convert settings' transitive i18n setup still initializes.
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

// A stand-in tool-settings UI that uses the shared editor Tooltip. The Tooltip
// pulls in the Preferences + Sidebar contexts, which the processor does not mount
// app-wide — so this reproduces the "usePreferences must be used within a
// PreferencesProvider" crash unless PipelineStepSettings supplies them.
function TooltipSettings() {
  return (
    <Tooltip content="help">
      <button type="button">field</button>
    </Tooltip>
  );
}

const step = {
  support: "editable",
  toolId: "compress",
  params: {},
} as unknown as WorkingToolStep;

const registry = {
  compress: { automationSettings: TooltipSettings },
} as unknown as Partial<ToolRegistry>;

// The real Convert tool settings, wired as they are in the registry. ConvertSettings was decoupled
// from the editor's FileContext so it can render here (the processor mounts no FileProvider); this
// pins that it renders its format selectors instead of crashing on a missing context.
const convertStep = {
  support: "editable",
  toolId: "convert",
  operation: "/api/v1/convert/pdf/word",
  params: convertDefaults,
} as unknown as WorkingToolStep;

const convertRegistry = {
  convert: {
    automationSettings: ConvertSettings,
    operationConfig: asRegistryConfig(convertOperationConfig),
  },
} as unknown as Partial<ToolRegistry>;

describe("PipelineStepSettings", () => {
  it("renders reused editor tool settings (which use the shared Tooltip) without app-wide Preferences/Sidebar providers", () => {
    expect(() =>
      render(
        <ProcessorTestProviders>
          <PipelineStepSettings
            step={step}
            registry={registry}
            onChange={() => {}}
          />
        </ProcessorTestProviders>,
      ),
    ).not.toThrow();
    expect(screen.getByText("field")).toBeInTheDocument();
  });

  it("renders the Convert tool's format selectors in the processor, with no FileContext mounted", () => {
    expect(() =>
      render(
        <ProcessorTestProviders>
          <PipelineStepSettings
            step={convertStep}
            registry={convertRegistry}
            onChange={() => {}}
          />
        </ProcessorTestProviders>,
      ),
    ).not.toThrow();
    expect(screen.getByText(/Convert from/)).toBeInTheDocument();
  });

  // Reproduces the convert-in-pipeline bug: picking a source format fires several onParameterChange
  // calls in one tick (set fromExtension, auto-target, reset options). If each rebuilt from the
  // step snapshot captured at render they'd clobber each other and the earlier field would be lost.
  it("accumulates several synchronous field changes instead of keeping only the last", () => {
    function DoubleWriteSettings({
      onParameterChange,
    }: ToolAutomationSettingsProps<ErasedToolParams>) {
      // Fire once on mount, mimicking a source-format change's burst of synchronous updates.
      useEffect(() => {
        onParameterChange("fromExtension", "pdf");
        onParameterChange("toExtension", "docx");
      }, []);
      return null;
    }

    const registry = {
      doubleWrite: { automationSettings: DoubleWriteSettings },
    } as unknown as Partial<ToolRegistry>;

    function Harness() {
      const [params, setParams] = useState<ErasedToolParams>({});
      const step = {
        toolId: "doubleWrite",
        support: "editable",
        operation: "/api/v1/x",
        params,
      } as unknown as WorkingToolStep;
      return (
        <>
          <PipelineStepSettings
            step={step}
            registry={registry}
            onChange={(update) =>
              setParams((prev) =>
                typeof update === "function" ? update(prev) : update,
              )
            }
          />
          <span data-testid="out">{JSON.stringify(params)}</span>
        </>
      );
    }

    render(
      <ProcessorTestProviders>
        <Harness />
      </ProcessorTestProviders>,
    );
    expect(JSON.parse(screen.getByTestId("out").textContent ?? "{}")).toEqual({
      fromExtension: "pdf",
      toExtension: "docx",
    });
  });
});
