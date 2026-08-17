import { describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
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
import ChangeMetadataSingleStep from "@app/components/tools/changeMetadata/ChangeMetadataSingleStep";
import { defaultParameters as changeMetadataDefaults } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";
import OverlayPdfsSettings from "@app/components/tools/overlayPdfs/OverlayPdfsSettings";
import { defaultParameters as overlayDefaults } from "@app/hooks/tools/overlayPdfs/useOverlayPdfsParameters";
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

// The real Change Metadata automation settings. Its editor variant auto-prefills the
// form from the open document via useViewer; that path is now gated on a ViewerProvider
// so it renders here (the portal mounts none) instead of crashing on useViewer.
const changeMetadataStep = {
  support: "editable",
  toolId: "changeMetadata",
  params: changeMetadataDefaults,
} as unknown as WorkingToolStep;

const changeMetadataRegistry = {
  changeMetadata: { automationSettings: ChangeMetadataSingleStep },
} as unknown as Partial<ToolRegistry>;

// The real Overlay PDFs automation settings. Its overlay-file picker uses the
// editor FilesModal when present; that read is now optional so the portal (which
// mounts no FilesModalProvider) renders a plain file input instead of crashing.
const overlayStep = {
  support: "editable",
  toolId: "overlayPdfs",
  params: overlayDefaults,
} as unknown as WorkingToolStep;

const overlayRegistry = {
  overlayPdfs: { automationSettings: OverlayPdfsSettings },
} as unknown as Partial<ToolRegistry>;

describe("PipelineStepSettings", () => {
  it("renders reused editor tool settings (which use the shared Tooltip) without app-wide Preferences/Sidebar providers", () => {
    expect(() =>
      render(
        <PortalTestProviders>
          <PipelineStepSettings
            step={step}
            registry={registry}
            onChange={() => {}}
          />
        </PortalTestProviders>,
      ),
    ).not.toThrow();
    expect(screen.getByText("field")).toBeInTheDocument();
  });

  it("renders the Convert tool's format selectors in the portal, with no FileContext mounted", () => {
    expect(() =>
      render(
        <PortalTestProviders>
          <PipelineStepSettings
            step={convertStep}
            registry={convertRegistry}
            onChange={() => {}}
          />
        </PortalTestProviders>,
      ),
    ).not.toThrow();
    expect(screen.getByText(/Convert from/)).toBeInTheDocument();
  });

  it("renders the Change Metadata tool's fields in the portal, with no ViewerProvider mounted", () => {
    expect(() =>
      render(
        <PortalTestProviders>
          <PipelineStepSettings
            step={changeMetadataStep}
            registry={changeMetadataRegistry}
            onChange={() => {}}
          />
        </PortalTestProviders>,
      ),
    ).not.toThrow();
    expect(screen.getByText("Standard Metadata")).toBeInTheDocument();
  });

  it("renders the Overlay PDFs tool's fields in the portal, with no FilesModalProvider mounted", () => {
    expect(() =>
      render(
        <PortalTestProviders>
          <PipelineStepSettings
            step={overlayStep}
            registry={overlayRegistry}
            onChange={() => {}}
          />
        </PortalTestProviders>,
      ),
    ).not.toThrow();
    expect(screen.getByText("Overlay Mode")).toBeInTheDocument();
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
      <PortalTestProviders>
        <Harness />
      </PortalTestProviders>,
    );
    expect(JSON.parse(screen.getByTestId("out").textContent ?? "{}")).toEqual({
      fromExtension: "pdf",
      toExtension: "docx",
    });
  });
});
