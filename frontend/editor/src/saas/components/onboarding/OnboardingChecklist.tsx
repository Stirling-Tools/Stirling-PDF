import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useAuth } from "@app/auth/UseSession";
import SaasOnboardingModal from "@app/components/onboarding/SaasOnboardingModal";
import StaticOnboardingSlide from "@app/components/onboarding/StaticOnboardingSlide";
import { DEFAULT_RUNTIME_STATE } from "@app/components/onboarding/orchestrator/onboardingConfig";
import {
  getFlowProgress,
  hasSeenFlow,
  markFlowSeen,
  setStepDone,
} from "@app/components/onboarding/orchestrator/onboardingStorage";
import { openAppSettings } from "@app/utils/appSettings";
import { requestStartTour } from "@app/constants/events";
import apiClient from "@app/services/apiClient";
import stirlingMark from "@app/assets/brand/modern-logo/logo512.png";
import styles from "@app/components/onboarding/OnboardingChecklist.module.css";

const FLOW_ID = "saas-checklist";
const STEP_DOWNLOAD_DESKTOP = "download-desktop";
const STEP_INVITE_TEAM = "invite-team";
const STEP_TAKE_TOUR = "take-tour";
const STEP_SHARE_ANALYTICS = "share-analytics";

interface ChecklistItem {
  id: string;
  titleKey: string;
  titleFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
  onClick: () => void;
}

/**
 * SaaS-only getting-started checklist that floats above the sidebar footer for
 * new users. Progress is persisted per step via the shared onboarding store, so
 * completed items stay ticked across reloads. Dismissing it (the X) hides it
 * permanently for the user.
 */
export function OnboardingChecklist() {
  const { t } = useTranslation();
  const { isAnonymous, loading } = useAuth();

  const [dismissed, setDismissed] = useState(() => hasSeenFlow(FLOW_ID));
  const [done, setDone] = useState<string[]>(() => getFlowProgress(FLOW_ID));
  const [expanded, setExpanded] = useState(true);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const markDone = useCallback((stepId: string) => {
    setStepDone(FLOW_ID, stepId);
    setDone((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]));
  }, []);

  const handleInviteTeam = useCallback(() => {
    // Open the settings modal on the Teams section without touching the URL
    // (event-driven open + navigate; no /settings/teams pushState).
    openAppSettings("teams");
    markDone(STEP_INVITE_TEAM);
  }, [markDone]);

  const handleTakeTour = useCallback(() => {
    // Always the user (tools) walkthrough, regardless of admin/user role. The
    // editor's onboarding listens for this event and drives the tour overlay.
    requestStartTour("tools");
    markDone(STEP_TAKE_TOUR);
  }, [markDone]);

  const items: ChecklistItem[] = useMemo(
    () => [
      {
        id: STEP_DOWNLOAD_DESKTOP,
        titleKey: "onboarding.checklist.downloadDesktop.title",
        titleFallback: "Download Stirling for Desktop",
        descriptionKey: "onboarding.checklist.downloadDesktop.description",
        descriptionFallback: "Run Stirling natively on your machine",
        onClick: () => setDownloadOpen(true),
      },
      {
        id: STEP_INVITE_TEAM,
        titleKey: "onboarding.checklist.inviteTeam.title",
        titleFallback: "Invite team members",
        descriptionKey: "onboarding.checklist.inviteTeam.description",
        descriptionFallback: "Collaborate with your team",
        onClick: handleInviteTeam,
      },
      {
        id: STEP_TAKE_TOUR,
        titleKey: "onboarding.checklist.takeTour.title",
        titleFallback: "Take the tour",
        descriptionKey: "onboarding.checklist.takeTour.description",
        descriptionFallback: "See how Stirling works in a quick walkthrough",
        onClick: handleTakeTour,
      },
      {
        id: STEP_SHARE_ANALYTICS,
        titleKey: "onboarding.checklist.shareAnalytics.title",
        titleFallback: "Share anonymous usage data",
        descriptionKey: "onboarding.checklist.shareAnalytics.description",
        descriptionFallback: "Help improve Stirling",
        onClick: () => setAnalyticsOpen(true),
      },
    ],
    [handleInviteTeam, handleTakeTour],
  );

  const doneCount = items.filter((item) => done.includes(item.id)).length;
  const total = items.length;
  const allDone = total > 0 && doneCount === total;

  const handleDismiss = useCallback(() => {
    markFlowSeen(FLOW_ID);
    setDismissed(true);
  }, []);

  // Both "skip" and "download" in the reused slide close the modal, and either
  // one should complete the task.
  const handleDownloadClose = useCallback(() => {
    markDone(STEP_DOWNLOAD_DESKTOP);
    setDownloadOpen(false);
  }, [markDone]);

  const closeAnalytics = useCallback(() => {
    markDone(STEP_SHARE_ANALYTICS);
    setAnalyticsOpen(false);
  }, [markDone]);

  const handleAnalyticsAction = useCallback(
    (action: string) => {
      if (action === "enable-analytics" || action === "disable-analytics") {
        const formData = new FormData();
        formData.append(
          "enabled",
          action === "enable-analytics" ? "true" : "false",
        );
        void apiClient
          .post("/api/v1/settings/update-enable-analytics", formData)
          .catch((error) => {
            console.error(
              "[OnboardingChecklist] analytics update failed",
              error,
            );
          });
      }
      closeAnalytics();
    },
    [closeAnalytics],
  );

  if (loading || isAnonymous || dismissed) {
    return null;
  }

  return (
    <>
      <div className={styles.card} data-testid="onboarding-checklist">
        <div
          className={styles.header}
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
        >
          <span className={styles.titleGroup}>
            <img
              src={stirlingMark}
              alt=""
              aria-hidden="true"
              className={styles.logo}
            />
            <span className={styles.title}>
              {t("onboarding.checklist.title", "Set up Stirling PDF")}
            </span>
          </span>
          <span className={styles.headerRight}>
            <span className={styles.progressCount}>
              {doneCount} / {total}
            </span>
            {expanded ? (
              <ExpandLessIcon className={styles.chevron} />
            ) : (
              <ExpandMoreIcon className={styles.chevron} />
            )}
            <span
              className={styles.closeButton}
              role="button"
              tabIndex={0}
              aria-label={t("onboarding.checklist.dismiss", "Dismiss")}
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDismiss();
                }
              }}
            >
              {allDone ? (
                <CheckCircleIcon className={styles.completeIcon} />
              ) : (
                <CloseIcon className={styles.closeIcon} />
              )}
            </span>
          </span>
        </div>

        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
          />
        </div>

        {expanded && (
          <div className={styles.items}>
            {items.map((item) => {
              const isDone = done.includes(item.id);
              return (
                <div
                  key={item.id}
                  className={styles.item}
                  role="button"
                  tabIndex={0}
                  onClick={item.onClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      item.onClick();
                    }
                  }}
                >
                  <span className={styles.itemIcon}>
                    {isDone ? (
                      <CheckCircleIcon className={styles.checkDone} />
                    ) : (
                      <RadioButtonUncheckedIcon className={styles.checkTodo} />
                    )}
                  </span>
                  <span className={styles.itemText}>
                    <span
                      className={`${styles.itemTitle} ${
                        isDone ? styles.itemTitleDone : ""
                      }`}
                    >
                      {t(item.titleKey, item.titleFallback)}
                    </span>
                    <span
                      className={`${styles.itemDescription} ${
                        isDone ? styles.itemDescriptionDone : ""
                      }`}
                    >
                      {t(item.descriptionKey, item.descriptionFallback)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SaasOnboardingModal
        opened={downloadOpen}
        onClose={handleDownloadClose}
        slideIds={["desktop-install"]}
      />

      {analyticsOpen && (
        <StaticOnboardingSlide
          key="analytics-choice"
          slideId="analytics-choice"
          runtimeState={DEFAULT_RUNTIME_STATE}
          allowDismiss
          onSkip={closeAnalytics}
          onAction={handleAnalyticsAction}
        />
      )}
    </>
  );
}
