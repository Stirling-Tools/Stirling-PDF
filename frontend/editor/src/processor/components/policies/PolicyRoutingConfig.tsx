import { routingDestinations } from "@app/services/policySources";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Banner, Button, Select } from "@app/ui";
import type { RoutingSetup } from "@app/components/policies/PolicySetupWizard";
import type { WireTriggerConfig } from "@app/policies/types";
import { availableOutputModes } from "@processor/components/pipelines/outputModes";
import { PolicyRoutingDestinations } from "@app/components/policies/PolicyRoutingDestinations";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";
import { useSources } from "@processor/queries/sources";
import { useAiEngineEnabled } from "@processor/hooks/useAiEngineEnabled";

interface PolicyRoutingConfigProps {
  value: RoutingSetup;
  onChange: (next: RoutingSetup) => void;
  onClose: () => void;
}

/** What pulls a watched source; a folder is watched, a webhook pushes, anything else is swept. */
export function triggerFor(type: string | undefined): WireTriggerConfig | null {
  if (!type) return null;
  if (type === "folder") return { type: "folder-watch", options: {} };
  if (type === "webhook") return { type: "webhook", options: {} };
  return {
    type: "schedule",
    options: { schedule: { type: "every", count: 1, unit: "HOURS" } },
  };
}

export function PolicyRoutingConfig({
  value,
  onChange,
  onClose,
}: PolicyRoutingConfigProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sourcesAsync = useSources();
  const { classificationEnabled, loading: aiLoading } = useAiEngineEnabled();

  const sources = useMemo(
    () =>
      (sourcesAsync.data?.sources ?? []).filter(
        (src) => src.status !== "disabled" && src.type !== "editor",
      ),
    [sourcesAsync.data],
  );
  const destinations = useMemo(
    () => routingDestinations(sources, availableOutputModes()),
    [sources],
  );

  function connectSource() {
    onClose();
    navigate(`${toProcessorPath(VIEW_PATHS.sources)}/new`);
  }

  return (
    <div className="processor-policies__wizard-section">
      <h3 className="processor-policies__wizard-heading">
        {t("processor.policies.wizard.routing.sourceHeading", "Watch")}
      </h3>
      <p className="processor-policies__wizard-desc">
        {t(
          "processor.policies.wizard.routing.sourceDescription",
          "Documents arriving here are classified, then sent on by the rules below.",
        )}
      </p>
      {sources.length === 0 ? (
        <Banner
          tone="info"
          description={t(
            "processor.policies.wizard.routing.needsSource",
            "Connect a folder, bucket or webhook for this policy to watch.",
          )}
          action={
            <Button variant="secondary" size="sm" onClick={connectSource}>
              {t("processor.policies.wizard.sources.connect")}
            </Button>
          }
        />
      ) : (
        <Select
          inputSize="sm"
          aria-label={t("processor.policies.wizard.routing.sourceHeading")}
          placeholder={t(
            "processor.policies.wizard.routing.chooseSource",
            "Choose what to watch",
          )}
          value={value.sourceId || null}
          invalid={value.sourceId === ""}
          onChange={(id) =>
            onChange({
              ...value,
              sourceId: id ?? "",
              trigger: triggerFor(sources.find((s) => s.id === id)?.type),
            })
          }
          options={sources.map((src) => ({ value: src.id, label: src.name }))}
          comboboxProps={{ withinPortal: true }}
        />
      )}

      <PolicyRoutingDestinations
        value={value}
        onChange={onChange}
        destinations={destinations}
        onCreateDestination={connectSource}
        classificationAvailable={aiLoading || classificationEnabled}
        classificationUnavailableReason={
          aiLoading
            ? undefined
            : t(
                "processor.pipelines.builder.routing.aiDisabled",
                "AI classification is not enabled. Enable it in Settings, or route on a document property instead.",
              )
        }
      />
    </div>
  );
}
