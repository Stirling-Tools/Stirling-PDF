import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Banner, Button, Select } from "@app/ui";
import type { RoutingSetup } from "@app/components/policies/PolicySetupWizard";
import type { WireTriggerConfig } from "@app/policies/types";
import { availableOutputModes } from "@portal/components/pipelines/outputModes";
import { RoutingRules } from "@portal/components/policies/RoutingRules";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { useSources } from "@portal/queries/sources";
import { useAiEngineEnabled } from "@portal/hooks/useAiEngineEnabled";

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
    () =>
      sources
        .filter((src) =>
          (availableOutputModes() as string[]).includes(src.type),
        )
        .map((src) => ({ id: src.id, name: src.name })),
    [sources],
  );

  function connectSource() {
    onClose();
    navigate(`${toPortalPath(VIEW_PATHS.sources)}/new`);
  }

  return (
    <div className="portal-policies__wizard-section">
      <h3 className="portal-policies__wizard-heading">
        {t("portal.policies.wizard.routing.sourceHeading", "Watch")}
      </h3>
      <p className="portal-policies__wizard-desc">
        {t(
          "portal.policies.wizard.routing.sourceDescription",
          "Documents arriving here are classified, then sent on by the rules below.",
        )}
      </p>
      {sources.length === 0 ? (
        <Banner
          tone="info"
          description={t(
            "portal.policies.wizard.routing.needsSource",
            "Connect a folder, bucket or webhook for this policy to watch.",
          )}
          action={
            <Button variant="secondary" size="sm" onClick={connectSource}>
              {t("portal.policies.wizard.sources.connect")}
            </Button>
          }
        />
      ) : (
        <Select
          inputSize="sm"
          aria-label={t("portal.policies.wizard.routing.sourceHeading")}
          placeholder={t(
            "portal.policies.wizard.routing.chooseSource",
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

      <h3 className="portal-policies__wizard-heading">
        {t("portal.pipelines.builder.routing.heading", "Routes")}
      </h3>
      <p className="portal-policies__wizard-desc">
        {t(
          "portal.policies.wizard.routing.description",
          "Each document is classified first, then delivered to the first rule it matches. Anything matching none goes to the destination below.",
        )}
      </p>
      <RoutingRules
        rules={value.routingRules}
        onChange={(routingRules) => onChange({ ...value, routingRules })}
        destinations={destinations}
        onCreateDestination={connectSource}
        classificationAvailable={aiLoading || classificationEnabled}
        classificationUnavailableReason={
          aiLoading
            ? undefined
            : t(
                "portal.pipelines.builder.routing.aiDisabled",
                "AI classification is not enabled. Enable it in Settings, or route using a no-AI document property.",
              )
        }
      />

      <h3 className="portal-policies__wizard-heading">
        {t(
          "portal.pipelines.builder.routing.fallback",
          "Everything else goes to",
        )}
      </h3>
      <Select
        inputSize="sm"
        aria-label={t("portal.pipelines.builder.routing.fallback")}
        placeholder={t("portal.policies.wizard.routing.chooseDestination")}
        value={value.outputIds[0] ?? null}
        invalid={value.outputIds.length !== 1}
        onChange={(id) => onChange({ ...value, outputIds: id ? [id] : [] })}
        options={destinations.map((d) => ({ value: d.id, label: d.name }))}
        comboboxProps={{ withinPortal: true }}
      />
    </div>
  );
}
