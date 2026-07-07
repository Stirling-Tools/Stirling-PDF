import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { fetchOnboarding, type OnboardingStep } from "@portal/api/home";
import { CloseIcon } from "@portal/components/icons";
import "@portal/components/SetupChecklist.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Enterprise upsell rung                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Enterprise on-ramp rung. The CTA differs by tier: free orgs start a guided
 * trial, subscribed (paying) orgs jump straight to a quote — both land in the
 * procurement flow.
 */
function EnterpriseRung({ paying }: { paying: boolean }) {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  return (
    <div className="portal-setup__enterprise">
      <div className="portal-setup__enterprise-copy">
        <span className="portal-setup__enterprise-tag">
          {t("portal.home.onboarding.enterprise.tag")}
        </span>
        <p className="portal-setup__enterprise-text">
          <strong>{t("portal.home.onboarding.enterprise.lead")}</strong>{" "}
          {t("portal.home.onboarding.enterprise.body")}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setActiveView("procurement")}
        trailingIcon={<span aria-hidden>→</span>}
      >
        {t(
          paying
            ? "portal.home.onboarding.enterprise.ctaQuote"
            : "portal.home.onboarding.enterprise.cta",
        )}
      </Button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  "Finish setting up" checklist                                            */
/* ──────────────────────────────────────────────────────────────────────── */

interface SetupChecklistProps {
  /** Opens the single-operation runner for steps whose CTA is `try-op`. */
  onTryOp: () => void;
}

/**
 * Getting-started checklist, rendered as the attached footer of the home hero
 * (welcome banner on free, deployed-Editor card on subscribed). An ordered
 * do-this-then-that sequence of navigable steps, each with a status chip once
 * complete. The header doubles as a dismiss control; the Enterprise rung
 * persists regardless so the upgrade path stays visible even after the
 * checklist is collapsed. Steps and the Enterprise CTA are tier-aware.
 */
export function SetupChecklist({ onTryOp }: SetupChecklistProps) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();
  const [dismissed, setDismissed] = useState(false);

  const state = useAsync<OnboardingStep[]>(() => fetchOnboarding(tier), [tier]);
  const { data: steps } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const doneCount = steps?.filter((s) => s.done).length ?? 0;

  function activate(step: OnboardingStep) {
    if (step.done || !step.cta) return;
    if (step.cta.kind === "try-op") {
      onTryOp();
    } else {
      setActiveView(step.cta.target as ViewId);
    }
  }

  const showList = !dismissed && steps && steps.length > 0;

  return (
    <div className="portal-setup">
      {isLoading && (
        <div className="portal-setup__list" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="portal-setup__row is-loading">
              <span className="portal-setup__dot" />
              <div className="portal-setup__text">
                <div className="portal-setup__skel" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isEmpty && !dismissed && (
        <EmptyState
          size="compact"
          title={t("portal.home.onboarding.empty.title")}
          description={t("portal.home.onboarding.empty.description")}
        />
      )}

      {showList && (
        <>
          <div className="portal-setup__head">
            <span className="portal-setup__eyebrow">
              {t("portal.home.onboarding.title")}
            </span>
            <button
              type="button"
              className="portal-setup__dismiss"
              onClick={() => setDismissed(true)}
              title={t("portal.home.onboarding.dismiss")}
            >
              {t("portal.home.onboarding.progress", {
                done: doneCount,
                total: steps.length,
              })}
              <CloseIcon size={13} />
            </button>
          </div>

          <ol className="portal-setup__list">
            {steps.map((s) => {
              const interactive = !s.done && !!s.cta;
              return (
                <li key={s.id} className="portal-setup__item">
                  <button
                    type="button"
                    className={
                      "portal-setup__row" +
                      (s.done ? " is-done" : "") +
                      (interactive ? " is-interactive" : "")
                    }
                    onClick={() => activate(s)}
                    disabled={!interactive}
                  >
                    <span
                      className={
                        "portal-setup__dot" + (s.done ? " is-done" : "")
                      }
                      aria-hidden
                    />
                    <span className="portal-setup__text">
                      <strong>{s.title}</strong>
                      <span>{s.blurb}</span>
                    </span>
                    <span
                      className={
                        "portal-setup__chip" + (s.done ? " is-done" : "")
                      }
                    >
                      {s.done
                        ? (s.status ?? t("portal.home.onboarding.doneChip"))
                        : t("portal.home.onboarding.notStarted")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <EnterpriseRung paying={tier !== "free"} />
    </div>
  );
}
