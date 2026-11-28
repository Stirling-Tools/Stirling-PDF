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
  // Distance from the workbench's bottom edge, or null while on that edge.
  const [lift, setLift] = useState<number | null>(null);

  // A phone has no edge to spare for it.
  const hidden =
    !openFeedback || preferences.hasDismissedFeedbackTag || isPhone;

  // Lifting only moves the tag vertically, so comparing horizontal spans
  // cannot flip-flop. The lift is measured from the bar rather than assumed,
  // as the bar grows when its controls wrap. The bar shifts as its dock
  // resizes, the tag as the workbench does or its label changes, and the
  // dock slides in on mount, so all of those re-measure.
  useLayoutEffect(() => {
    const tag = tagRef.current;
    const container = tag?.offsetParent;
    if (!tag || !container || !obstacle) {
      setLift(null);
      return;
    }
    const update = () => {
      const a = tag.getBoundingClientRect();
      const b = obstacle.getBoundingClientRect();
      const overlaps =
        a.left < b.right + OBSTACLE_GAP_PX &&
        b.left < a.right + OBSTACLE_GAP_PX;
      setLift(
        overlaps
          ? Math.round(
              container.getBoundingClientRect().bottom -
                b.top +
                OBSTACLE_GAP_PX,
            )
          : null,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    for (const element of [obstacle, obstacle.parentElement, container, tag]) {
      if (element) observer.observe(element);
    }
    const dock = obstacle.parentElement;
    dock?.addEventListener("animationend", update);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      dock?.removeEventListener("animationend", update);
      window.removeEventListener("resize", update);
    };
  }, [obstacle, hidden]);

  if (hidden) return null;

  const dismissLabel = t("feedback.tag.dismiss", "Hide the feedback button");

  return (
    <div
      ref={tagRef}
      className={lift == null ? styles.tag : `${styles.tag} ${styles.lifted}`}
      style={lift == null ? undefined : { bottom: lift }}
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
