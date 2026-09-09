import { useTranslation } from "react-i18next";
import { InfoTooltip, ToggleSwitch } from "@app/ui";
import "@portal/components/pipelines/EnforceAsPolicyControl.css";

export interface EnforceAsPolicyControlProps {
  /** Org-mandated policy (see Policy.required). */
  required: boolean;
  onRequiredChange: (required: boolean) => void;
  /** Lock the toggle for a non-manager. */
  disabled?: boolean;
  /**
   * The permission check is still loading. The toggle stays locked, but the manager-only tooltip is
   * withheld so a still-loading manager isn't told they lack permission.
   */
  permissionsLoading?: boolean;
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
  permissionsLoading = false,
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
          disabled && !permissionsLoading
            ? t("portal.pipelines.enforce.managerOnly")
            : t("portal.pipelines.enforce.desc")
        }
        ariaLabel={t("portal.pipelines.enforce.info")}
        position="bottom"
      />
    </span>
  );
}
