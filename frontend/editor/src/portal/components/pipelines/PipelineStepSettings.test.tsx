import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { WorkingToolStep } from "@app/hooks/tools/shared/toolAutomation";
import { PipelineStepSettings } from "@portal/components/pipelines/PipelineStepSettings";

vi.mock("react-i18next", () => ({
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
});
