import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Banner } from "@app/ui";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { SidebarProvider } from "@app/contexts/SidebarContext";
import { type ToolRegistry } from "@app/data/toolsTaxonomy";
import { type ErasedToolParams } from "@app/hooks/tools/shared/toolOperationTypes";
import { type WorkingToolStep } from "@app/hooks/tools/shared/toolAutomation";

import { PolicyExternalApiConfig } from "@portal/components/policies/PolicyExternalApiConfig";
import { isIntegrationStep } from "@portal/components/pipelines/integrationStep";
import type { ExternalApiStepParams } from "@portal/components/policies/stepOperations";

/**
 * A params update: the next params outright, or a merge from the latest params. Settings UIs fire
 * several single-field changes synchronously (e.g. convert's source-format change also resets the
 * target and options); the merge form lets them accumulate against current state instead of each
 * rebuilding from the `step` snapshot captured at render, which would clobber the earlier fields.
 */
export type ParamsUpdate =
  | ErasedToolParams
  | ((prev: ErasedToolParams) => ErasedToolParams);

interface PipelineStepSettingsProps {
  step: WorkingToolStep;
  /** The step's 1-based place in the chain, so cross-step variables offer only earlier steps. */
  stepPosition?: number;
  registry: Partial<ToolRegistry>;
  onChange: (update: ParamsUpdate) => void;
}

/**
 * Renders the parameter editor for one pipeline step, chosen by the tool's capability:
 * the tool's own settings UI when editable, an explanatory note when it has no parameters,
 * or a "not supported yet" fallback for tools not yet migrated to the mapper seam.
 */
export function PipelineStepSettings({
  step,
  stepPosition,
  registry,
  onChange,
}: PipelineStepSettingsProps) {
  // Hooks first: selecting a different step re-renders this same instance, so an early return
  // above useTranslation would change the hook count between renders and crash.
  const { t } = useTranslation();

  // An integration step is configured by the operations catalogue, not by a tool's settings UI:
  // it has no registry entry to look one up from.
  if (isIntegrationStep(step)) {
    return (
      <PolicyExternalApiConfig
        parameters={step.params as unknown as ExternalApiStepParams}
        stepPosition={stepPosition}
        onChange={(params) => onChange(params as never)}
      />
    );
  }

  if (step.support === "noSettings") {
    return (
      <Banner
        tone="info"
        description={t("portal.pipelines.composer.noToolSettings")}
      />
    );
  }

  const entry = step.toolId ? registry[step.toolId] : undefined;
  const Settings =
    step.support === "editable" ? entry?.automationSettings : null;

  if (!Settings) {
    return (
      <Banner
        tone="warning"
        description={t("portal.pipelines.composer.editingUnsupported")}
      />
    );
  }

  return (
    <PreferencesProvider>
      <SidebarProvider>
        <Suspense fallback={null}>
          <Settings
            parameters={step.params}
            onParameterChange={(key, value) =>
              onChange((prev) => ({ ...prev, [key]: value }))
            }
            disabled={false}
          />
        </Suspense>
      </SidebarProvider>
    </PreferencesProvider>
  );
}
