import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { useAuth } from "@app/auth/UseSession";
import { useChecklistInviteTarget } from "@app/components/onboarding/checklistInviteTarget";
import {
  useChecklistSetupItem,
  type ChecklistItem,
} from "@app/components/onboarding/checklistSetupItem";
import { useAccountCreatedAt } from "@app/components/onboarding/accountCreatedAt";
import {
  getFlowDismissedAt,
  getFlowProgress,
  markFlowDismissed,
  setStepDone,
} from "@app/components/onboarding/orchestrator/onboardingStorage";
import { openAppSettings } from "@app/utils/appSettings";
import { requestStartTour } from "@app/constants/events";
import stirlingMark from "@app/assets/brand/modern-logo/logo512.png";
import styles from "@app/components/onboarding/OnboardingChecklist.module.css";

const FLOW_ID = "saas-checklist";
const STEP_INVITE_TEAM = "invite-team";
const STEP_TAKE_TOUR = "take-tour";

const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_SNOOZE_MS = 7 * DAY_MS;
const NEW_ACCOUNT_MAX_AGE_MS = 14 * DAY_MS;

function isSnoozed(): boolean {
  const dismissedAt = getFlowDismissedAt(FLOW_ID);
  return dismissedAt !== null && Date.now() - dismissedAt < DISMISS_SNOOZE_MS;
}

/** Getting-started checklist above the sidebar footer, for accounts under two weeks
 * old. Ticks persist per browser in the shared onboarding store; the X snoozes it for
 * a week, and it is gone for good once every applicable step is done. Steps finished
 * before this mount are left out, so a returning user sees only what is left. */
export function OnboardingChecklist() {
  const { t } = useTranslation();
  const { isAnonymous, loading } = useAuth();
  const account = useAccountCreatedAt();
  const invite = useChecklistInviteTarget();
  const inviteTarget = invite.target;

  const [dismissed, setDismissed] = useState(isSnoozed);
  const [done, setDone] = useState<string[]>(() => getFlowProgress(FLOW_ID));
  const [doneBeforeMount] = useState(done);
  const [expanded, setExpanded] = useState(true);

  const markDone = useCallback((stepId: string) => {
    setStepDone(FLOW_ID, stepId);
    setDone((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]));
  }, []);

  const handleInviteTeam = useCallback(() => {
    if (inviteTarget) openAppSettings(inviteTarget);
    markDone(STEP_INVITE_TEAM);
  }, [inviteTarget, markDone]);

  const handleTakeTour = useCallback(() => {
    // Always the user (tools) walkthrough, regardless of admin/user role. The
    // editor's onboarding listens for this event and drives the tour overlay.
    requestStartTour("tools");
    markDone(STEP_TAKE_TOUR);
  }, [markDone]);

  const setup = useChecklistSetupItem(markDone);

  const items: ChecklistItem[] = [
    ...(setup.item ? [setup.item] : []),
    ...(inviteTarget
      ? [
          {
            id: STEP_INVITE_TEAM,
            titleKey: "onboarding.checklist.inviteTeam.title",
            titleFallback: "Invite team members",
            descriptionKey: "onboarding.checklist.inviteTeam.description",
            descriptionFallback: "Collaborate with your team",
            onClick: handleInviteTeam,
          },
        ]
      : []),
    {
      id: STEP_TAKE_TOUR,
      titleKey: "onboarding.checklist.takeTour.title",
      titleFallback: "Take the tour",
      descriptionKey: "onboarding.checklist.takeTour.description",
      descriptionFallback: "See how Stirling works in a quick walkthrough",
      onClick: handleTakeTour,
    },
  ];

  const doneCount = items.filter((item) => done.includes(item.id)).length;
  const total = items.length;
  const allDone = doneCount === total;
  const visibleItems = items.filter(
    (item) => !doneBeforeMount.includes(item.id),
  );

  const handleDismiss = useCallback(() => {
    markFlowDismissed(FLOW_ID);
    setDismissed(true);
  }, []);

  const isEstablishedAccount =
    account.createdAt !== null &&
    Date.now() - account.createdAt.getTime() > NEW_ACCOUNT_MAX_AGE_MS;

  if (
    loading ||
    account.loading ||
    invite.loading ||
    isAnonymous ||
    isEstablishedAccount ||
    dismissed ||
    allDone
  ) {
    // The download slide marks its step done on close, so it must outlive the card.
    return <>{setup.dialog}</>;
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
              <Icon
                name="chevron-up"
                size="0.95rem"
                className={styles.chevron}
              />
            ) : (
              <Icon
                name="chevron-down"
                size="0.95rem"
                className={styles.chevron}
              />
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
              <Icon name="x" size="0.95rem" />
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
            {visibleItems.map((item) => {
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
                      <Icon
                        name="circle-check"
                        size="1.05rem"
                        className={styles.checkDone}
                      />
                    ) : (
                      <Icon
                        name="circle"
                        size="1.05rem"
                        className={styles.checkTodo}
                      />
                    )}
                  </span>
                  <span className={styles.itemText}>
                    <span
                      className={`${styles.itemTitle} ${isDone ? styles.itemTitleDone : ""}`}
                    >
                      {t(item.titleKey, item.titleFallback)}
                    </span>
                    <span
                      className={`${styles.itemDescription} ${isDone ? styles.itemDescriptionDone : ""}`}
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

      {setup.dialog}
    </>
  );
}
