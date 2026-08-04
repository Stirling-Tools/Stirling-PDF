import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { WorkingToolStep } from "@app/hooks/tools/shared/toolAutomation";
import { asRegistryConfig } from "@app/hooks/tools/shared/toolOperationTypes";
import ConvertSettings from "@app/components/tools/convert/ConvertSettings";
import { convertOperationConfig } from "@app/hooks/tools/convert/useConvertOperation";
import { defaultParameters as convertDefaults } from "@app/hooks/tools/convert/useConvertParameters";
import { PipelineStepSettings } from "@portal/components/pipelines/PipelineStepSettings";

// Override only useTranslation; keep the rest of react-i18next (initReactI18next et al.) real, so
// the convert settings' transitive i18n setup still initializes.
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

// A stand-in tool-settings UI that uses the shared editor Tooltip. The Tooltip
// pulls in the Preferences + Sidebar contexts, which the portal does not mount
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
// from the editor's FileContext so it can render here (the portal mounts no FileProvider); this
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
        <MantineProvider>
          <PipelineStepSettings
            step={step}
            registry={registry}
            onChange={() => {}}
          />
        </MantineProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByText("field")).toBeInTheDocument();
  });

  it("renders the Convert tool's format selectors in the portal, with no FileContext mounted", () => {
    expect(() =>
      render(
        <MantineProvider>
          <PipelineStepSettings
            step={convertStep}
            registry={convertRegistry}
            onChange={() => {}}
          />
        </MantineProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByText(/Convert from/)).toBeInTheDocument();
  });
});
