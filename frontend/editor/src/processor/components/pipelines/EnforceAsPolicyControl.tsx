import { useTranslation } from "react-i18next";
import { InfoTooltip, ToggleSwitch } from "@app/ui";
import "@processor/components/pipelines/EnforceAsPolicyControl.css";

export interface EnforceAsPolicyControlProps {
  /** Org-mandated policy (see Policy.required). */
  required: boolean;
  onRequiredChange: (required: boolean) => void;
}

/**
 * The "Enforce as policy" switch plus the app's standard inline (i) info affordance explaining what
 * it means. Shared by the builder header and the simple wizard so the control reads and behaves
 * identically wherever a pipeline can be made org-mandated.
 */
export function EnforceAsPolicyControl({
  required,
  onRequiredChange,
}: EnforceAsPolicyControlProps) {
  const { t } = useTranslation();
  return (
    <span className="processor-enforce">
      <ToggleSwitch
        size="sm"
        checked={required}
        onChange={onRequiredChange}
        label={t("processor.pipelines.enforce.label")}
      />
      <InfoTooltip
        label={t("processor.pipelines.enforce.desc")}
        ariaLabel={t("processor.pipelines.enforce.info")}
        position="bottom"
      />
    </span>
  );
}
