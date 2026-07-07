import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Banner } from "@app/ui";
import { type ToolRegistry } from "@app/data/toolsTaxonomy";
import { type ErasedToolParams } from "@app/hooks/tools/shared/toolOperationTypes";
import { type WorkingStep } from "@portal/components/pipelines/pipelineTools";

interface PipelineStepSettingsProps {
  step: WorkingStep;
  registry: Partial<ToolRegistry>;
  onChange: (params: ErasedToolParams) => void;
}

/**
 * Renders the parameter editor for one pipeline step, chosen by the tool's capability:
 * the tool's own settings UI when editable, an explanatory note when it has no parameters,
 * or a "not supported yet" fallback for tools not yet migrated to the mapper seam.
 */
export function PipelineStepSettings({
  step,
  registry,
  onChange,
}: PipelineStepSettingsProps) {
  const { t } = useTranslation();

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
    <Suspense fallback={null}>
      <Settings
        parameters={step.params}
        onParameterChange={(key, value) =>
          onChange({ ...step.params, [key]: value })
        }
        disabled={false}
      />
    </Suspense>
  );
}
