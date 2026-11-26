import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import { useFeedback } from "@editor/hooks/useFeedback";
import { useIsPhone } from "@editor/hooks/useIsMobile";
import styles from "@editor/components/feedback/FeedbackTag.module.css";
import { useFeedbackTagObstacle } from "@editor/components/feedback/feedbackTagObstacle";

/** Closer than this to a docked bar counts as in its way. */
const OBSTACLE_GAP_PX = 8;

/**
 * Tab on the bottom edge of the workbench that opens feedback. Must render
 * inside a positioned container. Dismissing it is permanent for this browser;
 * Settings keeps an entry that cannot be dismissed. It floats above a docked
 * bar (the viewer's toolbar) only while that bar reaches under it.
 */
export function FeedbackTag() {
  const { t } = useTranslation();
  const openFeedback = useFeedback();
  const { preferences, updatePreference } = usePreferences();
  const isPhone = useIsPhone();
  const obstacle = useFeedbackTagObstacle();
  const tagRef = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(false);

  // A phone has no edge to spare for it.
  const hidden =
    !openFeedback || preferences.hasDismissedFeedbackTag || isPhone;

  // Lifting only moves the tag vertically, so comparing horizontal spans
  // cannot flip-flop. The bar shifts as its dock resizes and the tag as the
  // workbench does, so both are watched.
  useLayoutEffect(() => {
    const tag = tagRef.current;
    if (!tag || !obstacle) {
      setLifted(false);
      return;
    }
    const update = () => {
      const a = tag.getBoundingClientRect();
      const b = obstacle.getBoundingClientRect();
      setLifted(
        a.left < b.right + OBSTACLE_GAP_PX &&
          b.left < a.right + OBSTACLE_GAP_PX,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    for (const element of [
      obstacle,
      obstacle.parentElement,
      tag.offsetParent,
    ]) {
      if (element) observer.observe(element);
    }
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [obstacle, hidden]);

  if (hidden) return null;

  const dismissLabel = t("feedback.tag.dismiss", "Hide the feedback button");

  return (
    <div
      ref={tagRef}
      className={lifted ? `${styles.tag} ${styles.lifted}` : styles.tag}
    >
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
