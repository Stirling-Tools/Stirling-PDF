import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import { useFeedback } from "@editor/hooks/useFeedback";
import { useIsPhone } from "@editor/hooks/useIsMobile";
import styles from "@editor/components/feedback/FeedbackTag.module.css";

/**
 * Tab on the bottom edge of the workbench that opens feedback. Must render
 * inside a positioned container. Dismissing it is permanent for this browser;
 * Settings keeps an entry that cannot be dismissed.
 */
export function FeedbackTag() {
  const { t } = useTranslation();
  const openFeedback = useFeedback();
  const { preferences, updatePreference } = usePreferences();
  const isPhone = useIsPhone();

  // A phone has no edge to spare for it.
  if (!openFeedback || preferences.hasDismissedFeedbackTag || isPhone) {
    return null;
  }

  const dismissLabel = t("feedback.tag.dismiss", "Hide the feedback button");

  return (
    <div className={styles.tag}>
      <button type="button" className={styles.open} onClick={openFeedback}>
        <Icon name="stirling-mark" size="0.875rem" className={styles.mark} />
        {t("feedback.tag.label", "Feedback")}
      </button>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => updatePreference("hasDismissedFeedbackTag", true)}
        aria-label={dismissLabel}
        title={dismissLabel}
      >
        <Icon name="x" size="0.75rem" />
      </button>
    </div>
  );
}
