import { useTranslation } from "react-i18next";
import { Select } from "@app/ui";
import { RoutingRules } from "@app/components/policies/RoutingRules";
import type { RoutingSetup } from "@app/components/policies/PolicySetupWizard";

export interface RoutingDestination {
  id: string;
  name: string;
}

interface PolicyRoutingDestinationsProps {
  value: RoutingSetup;
  onChange: (next: RoutingSetup) => void;
  destinations: RoutingDestination[];
  onCreateDestination?: () => void;
  classificationAvailable?: boolean;
  classificationUnavailableReason?: string;
  compact?: boolean;
}

/** Shared route rules and fallback; the host supplies the watched source and writable destinations. */
export function PolicyRoutingDestinations({
  value,
  onChange,
  destinations,
  onCreateDestination,
  classificationAvailable,
  classificationUnavailableReason,
  compact = false,
}: PolicyRoutingDestinationsProps) {
  const { t } = useTranslation();
  return (
    <div className="portal-policies__wizard-section">
      <h3 className="portal-policies__wizard-heading">
        {t("processor.pipelines.builder.routing.heading", "Routes")}
      </h3>
      {!compact && (
        <p className="portal-policies__wizard-desc">
          {t(
            "processor.policies.wizard.routing.description",
            "Each document is classified first, then delivered to the first rule it matches. Anything matching none goes to the destination below.",
          )}
        </p>
      )}
      <RoutingRules
        rules={value.routingRules}
        onChange={(routingRules) => onChange({ ...value, routingRules })}
        destinations={destinations}
        onCreateDestination={onCreateDestination}
        classificationAvailable={classificationAvailable}
        classificationUnavailableReason={classificationUnavailableReason}
      />

      <h3 className="portal-policies__wizard-heading">
        {t(
          "processor.pipelines.builder.routing.fallback",
          "Everything else goes to",
        )}
      </h3>
      <Select
        inputSize="sm"
        aria-label={t("processor.pipelines.builder.routing.fallback")}
        placeholder={t("processor.policies.wizard.routing.chooseDestination")}
        value={value.outputIds[0] ?? null}
        invalid={value.outputIds.length !== 1}
        onChange={(id) => onChange({ ...value, outputIds: id ? [id] : [] })}
        options={destinations.map((d) => ({ value: d.id, label: d.name }))}
        comboboxProps={{ withinPortal: true }}
      />
    </div>
  );
}
