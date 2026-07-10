import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import type { OnboardingProgress } from "@portal/hooks/useOnboardingProgress";
import { DownloadEditorModal } from "@portal/components/DownloadEditorModal";
import CheckRounded from "@mui/icons-material/CheckRounded";
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
        variant="secondary"
        size="sm"
        onClick={() => setActiveView("procurement")}
        rightSection={<span aria-hidden>→</span>}
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
/*  Getting-started steps                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

interface Step {
  id: string;
  title: string;
  blurb: string;
  done: boolean;
  onClick: () => void;
}

/**
 * Numbered getting-started steps, rendered as the body of the home hero. Each
 * row opens its in-app surface; a completed step (from {@link OnboardingProgress})
 * swaps its number for a check. When every step is done the parent collapses the
 * hero to the deployed-status header and stops rendering this list entirely.
 */
export function SetupChecklist({ progress }: { progress: OnboardingProgress }) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();
  const [downloadOpen, setDownloadOpen] = useState(false);

  const steps: Step[] = [
    {
      id: "editor",
      title: t("portal.home.onboarding.steps.editor.title"),
      blurb: t("portal.home.onboarding.steps.editor.blurb"),
      done: progress.editorDone,
      // Downloads are per-OS, so open the install picker rather than route away.
      onClick: () => setDownloadOpen(true),
    },
    {
      id: "policies",
      title: t("portal.home.onboarding.steps.policies.title"),
      blurb: t("portal.home.onboarding.steps.policies.blurb", {
        active: progress.policiesActive,
        recommended: progress.policiesRecommended,
      }),
      done: progress.policiesDone,
      onClick: () => setActiveView("policies"),
    },
    {
      id: "invite",
      title: t("portal.home.onboarding.steps.invite.title"),
      blurb: t("portal.home.onboarding.steps.invite.blurb"),
      done: progress.inviteDone,
      onClick: () => setActiveView("users"),
    },
  ];

  return (
    <div className="portal-setup">
      <ol className="portal-setup__list">
        {steps.map((s, i) => (
          <li key={s.id} className="portal-setup__item">
            <button
              type="button"
              className={"portal-setup__row" + (s.done ? " is-done" : "")}
              onClick={s.onClick}
            >
              <span
                className={"portal-setup__num" + (s.done ? " is-done" : "")}
                aria-hidden
              >
                {s.done ? <CheckRounded sx={{ fontSize: 16 }} /> : i + 1}
              </span>
              <span className="portal-setup__text">
                <strong>{s.title}</strong>
                <span>{s.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <EnterpriseRung paying={tier !== "free"} />

      <DownloadEditorModal
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
      />
    </div>
  );
}
