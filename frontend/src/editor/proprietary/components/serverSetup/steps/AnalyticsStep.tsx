import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { SetupNote } from "@editor/components/serverSetup/SetupFields";
import styles from "@editor/components/shared/setupCard/SetupCard.module.css";

const ANALYTICS_DOCS =
  "https://docs.stirlingpdf.com/Server/Analytics-and-Telemetry/";

export function AnalyticsStep() {
  const { t } = useTranslation();
  const settingsPath = [
    t("settings.title", "Settings"),
    t("settings.server.title", "Server"),
    t("settings.policiesPrivacy.title", "Legal & privacy"),
  ].join(" → ");
  return (
    <SetupNote>
      <p className={styles.noteText}>
        {t(
          "serverSetup.analytics.note",
          "Share usage data from this server with us to help us improve Stirling PDF. We never collect files or their contents.",
        )}
      </p>
      <p className={styles.noteText}>
        {t(
          "serverSetup.analytics.changeLater",
          "You can change this at any time in {{path}}.",
          { path: settingsPath },
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
  );
}
