import { useTranslation } from "react-i18next";
import { InfoTooltip, ToggleSwitch } from "@app/ui";
import "@portal/components/pipelines/EnforceAsPolicyControl.css";

export interface EnforceAsPolicyControlProps {
  /** Org-mandated policy (see Policy.required). */
  required: boolean;
  onRequiredChange: (required: boolean) => void;
  /** Lock the toggle when the user can't manage required policies (a non-admin/-team-leader). */
  disabled?: boolean;
}

/**
 * The "Enforce as policy" switch plus the app's standard inline (i) info affordance explaining what
 * it means. Shared by the builder header and the simple wizard so the control reads and behaves
 * identically wherever a pipeline can be made org-mandated.
 */
export function EnforceAsPolicyControl({
  required,
  onRequiredChange,
  disabled = false,
}: EnforceAsPolicyControlProps) {
  const { t } = useTranslation();
  return (
    <span className="portal-enforce">
      <ToggleSwitch
        size="sm"
        checked={required}
        onChange={onRequiredChange}
        disabled={disabled}
        label={t("portal.pipelines.enforce.label")}
      />
      <InfoTooltip
        label={
          disabled
            ? t("portal.pipelines.enforce.managerOnly")
            : t("portal.pipelines.enforce.desc")
        }
        ariaLabel={t("portal.pipelines.enforce.info")}
        position="bottom"
      />
    </span>
  );
}
