import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import {
  SettingRow,
  SetupNote,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

const ANALYTICS_DOCS = "https://docs.stirlingpdf.com/analytics-telemetry/";

export function AnalyticsStep({ draft, update }: SetupStepProps) {
  const { t } = useTranslation();
  const label = t("serverSetup.analytics.label", "Usage analytics");
  return (
    <>
      <SettingRow label={label}>
        {() => (
          <SegmentedControl
            fullWidth
            ariaLabel={label}
            value={draft.analytics === false ? "off" : "on"}
            onChange={(value) => update({ analytics: value === "on" })}
            options={[
              { value: "on", label: t("serverSetup.on", "On") },
              { value: "off", label: t("serverSetup.off", "Off") },
            ]}
          />
        )}
      </SettingRow>
      <SetupNote>
        <p className={styles.noteText}>
          {t(
            "serverSetup.analytics.note",
            "Anonymous usage data helps us improve Stirling PDF. We never collect personal information or file contents.",
          )}
        </p>
        <a
          className={styles.noteLink}
          href={ANALYTICS_DOCS}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("serverSetup.analytics.learnMore", "What we collect")}
          <Icon name="external-link" size={14} />
        </a>
      </SetupNote>
    </>
  );
}
