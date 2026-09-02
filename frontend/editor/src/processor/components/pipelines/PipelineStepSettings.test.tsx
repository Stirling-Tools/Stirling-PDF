import { describe, expect, it, vi } from "vitest";
import {
  Component,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { ProcessorTestProviders } from "@processor/test/TestQueryProvider";
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { SidebarProvider } from "@app/contexts/SidebarContext";
import { Tooltip } from "@app/components/shared/Tooltip";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import {
  getExecutableTools,
  type WorkingToolStep,
} from "@app/hooks/tools/shared/toolAutomation";
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
import { PipelineStepSettings } from "@processor/components/pipelines/PipelineStepSettings";

// Override only useTranslation; keep the rest of react-i18next (initReactI18next et al.) real, so
// the convert settings' transitive i18n setup still initializes.
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en-US", changeLanguage: vi.fn() },
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

// The real Change Metadata automation settings. Its editor variant auto-prefills the
// form from the open document via useViewer; that path is now gated on a ViewerProvider
// so it renders here (the processor mounts none) instead of crashing on useViewer.
const changeMetadataStep = {
  support: "editable",
  toolId: "changeMetadata",
  params: changeMetadataDefaults,
} as unknown as WorkingToolStep;

const changeMetadataRegistry = {
  changeMetadata: { automationSettings: ChangeMetadataSingleStep },
} as unknown as Partial<ToolRegistry>;

// The real Overlay PDFs automation settings. Its overlay-file picker uses the
// editor FilesModal when present; that read is now optional so the processor (which
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
        <ProcessorTestProviders>
          <PipelineStepSettings
            step={step}
            registry={registry}
            onChange={() => {}}
            assetNames={{}}
            onClearBinding={() => {}}
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
            assetNames={{}}
            onClearBinding={() => {}}
          />
        </ProcessorTestProviders>,
      ),
    ).not.toThrow();
    expect(screen.getByText(/Convert from/)).toBeInTheDocument();
  });

  it("renders the Change Metadata tool's fields in the processor, with no ViewerProvider mounted", () => {
    expect(() =>
      render(
        <ProcessorTestProviders>
          <PipelineStepSettings
            step={changeMetadataStep}
            registry={changeMetadataRegistry}
            onChange={() => {}}
            assetNames={{}}
            onClearBinding={() => {}}
          />
        </ProcessorTestProviders>,
      ),
    ).not.toThrow();
    expect(screen.getByText("Standard Metadata")).toBeInTheDocument();
  });

  it("renders the Overlay PDFs tool's fields in the processor, with no FilesModalProvider mounted", () => {
    expect(() =>
      render(
        <ProcessorTestProviders>
          <PipelineStepSettings
            step={overlayStep}
            registry={overlayRegistry}
            onChange={() => {}}
            assetNames={{}}
            onClearBinding={() => {}}
          />
        </ProcessorTestProviders>,
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
            assetNames={{}}
            onClearBinding={() => {}}
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

// Records a render crash and swallows it (renders nothing), so one broken tool is attributed by id
// instead of aborting the whole sweep - mirroring the processor's own ErrorBoundary around the builder.
class CaptureBoundary extends Component<
  { onError: (error: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Automated version of the manual "add every tool" sweep: render each tool's real automation
// settings in a processor-only context (the same Preferences + Sidebar + Suspense wrappers
// PipelineStepSettings uses, and NO editor providers) and fail listing any that throw. This is the
// guard that would have caught Change Metadata (useViewer) and Overlay PDFs (useFilesModalContext).
describe("PipelineStepSettings: every tool's settings render in the processor", () => {
  it("renders each tool's automation settings without throwing", async () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());
    const catalog = result.current.allTools;
    // getExecutableTools is exactly what PipelineBuilder feeds its "Add a tool" picker, so this
    // sweeps precisely the tools a user can add. Narrow to "editable" (renders a settings
    // component); "noSettings"/"unsupported" steps show a Banner instead and can't crash.
    const editableTools = getExecutableTools(catalog)
      .filter((tool) => tool.support === "editable")
      .map((tool) => [tool.toolId, catalog[tool.toolId]] as const)
      .filter(([, entry]) => Boolean(entry?.automationSettings));
    // Guard against the filter silently matching nothing (e.g. a registry-shape change).
    expect(editableTools.length).toBeGreaterThan(10);

    const failures: { toolId: string; message: string }[] = [];

    for (const [toolId, entry] of editableTools) {
      const Settings = entry.automationSettings as ComponentType<
        ToolAutomationSettingsProps<ErasedToolParams>
      >;
      const params = entry.operationConfig?.defaultParameters ?? {};

      const caught: { error: Error | null } = { error: null };
      // The sentinel sibling commits only once the lazy Settings actually renders, so we wait for a
      // real render (or a caught throw) - not just the providers' wrapper DOM.
      const { unmount } = render(
        <ProcessorTestProviders>
          <PreferencesProvider>
            <SidebarProvider>
              <CaptureBoundary
                onError={(error) => {
                  caught.error = error;
                }}
              >
                <Suspense fallback={null}>
                  <Settings
                    parameters={params}
                    onParameterChange={() => {}}
                    disabled={false}
                  />
                  <span data-testid={`rendered-${toolId}`} />
                </Suspense>
              </CaptureBoundary>
            </SidebarProvider>
          </PreferencesProvider>
        </ProcessorTestProviders>,
      );

      await waitFor(() =>
        expect(
          caught.error !== null ||
            screen.queryByTestId(`rendered-${toolId}`) !== null,
        ).toBe(true),
      );

      if (caught.error) {
        failures.push({ toolId, message: caught.error.message });
      }
      unmount();
    }

    expect(failures).toEqual([]);
  }, 30000);
});
