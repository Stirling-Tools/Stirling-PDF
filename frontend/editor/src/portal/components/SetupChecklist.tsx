import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchPolicies, type PoliciesResponse } from "@portal/api/policies";
import { fetchSources, type SourcesResponse } from "@portal/api/sources";
import { CloseIcon } from "@portal/components/icons";
import "@portal/components/SetupChecklist.css";

/** Where the Stirling PDF Editor desktop app is downloaded. */
const EDITOR_DOWNLOAD_URL = "https://stirling.com/download";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Enterprise upsell rung                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Enterprise on-ramp rung. The CTA differs by tier: free orgs start a guided
 * trial, subscribed (paying) orgs jump straight to a quote — both open the
 * procurement flow. When {@code onStart} is given the CTA opens the flow's setup
 * modal over Home; otherwise it falls back to navigating to the procurement view.
 */
function EnterpriseRung({
  paying,
  onStart,
}: {
  paying: boolean;
  onStart?: () => void;
}) {
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
        onClick={onStart ?? (() => setActiveView("procurement"))}
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
/*  "Finish setting up" checklist                                            */
/* ──────────────────────────────────────────────────────────────────────── */

type StepAction =
  | { kind: "external"; href: string }
  | { kind: "navigate"; view: ViewId };

interface Step {
  id: string;
  title: string;
  blurb: string;
  done: boolean;
  /** Status chip shown once the step is done. */
  chip: string;
  action: StepAction;
}

/**
 * Getting-started checklist, rendered as the attached footer of the home hero
 * (welcome banner on free, deployed-Editor card on subscribed). Steps are a
 * fixed do-this-then-that sequence with translatable copy; the completion
 * state and counts are derived live from the org's real policies and sources
 * (the same data the Policies / Sources pages show). The header doubles as a
 * dismiss control; the Enterprise rung persists regardless.
 */
export function SetupChecklist({
  onStartEnterprise,
}: {
  /** Start the enterprise flow in place (opens the setup modal over Home). Falls back to
   * navigating to the procurement view when omitted (e.g. in isolated stories). */
  onStartEnterprise?: () => void;
} = {}) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();
  const [dismissed, setDismissed] = useState(false);

  const state = useAsync<[PoliciesResponse, SourcesResponse]>(
    () => Promise.all([fetchPolicies(), fetchSources()]),
    [],
  );
  const { data, loading } = state;

  const steps = useMemo<Step[]>(() => {
    const [policies, sources] = data ?? [];
    const active = policies?.summary.active ?? 0;
    const recommended = Math.max(
      0,
      (policies?.summary.categories ?? 0) - active,
    );
    // A source counts as connected once it's set up and not disabled.
    const connected =
      sources?.sources.filter((s) => s.status !== "disabled").length ?? 0;

    return [
      {
        id: "editor",
        title: t("portal.home.onboarding.steps.editor.title"),
        blurb: t("portal.home.onboarding.steps.editor.blurb"),
        // "Deploy the desktop app" has no server signal — always an open task.
        done: false,
        chip: "",
        action: { kind: "external", href: EDITOR_DOWNLOAD_URL },
      },
      {
        id: "policies",
        title: t("portal.home.onboarding.steps.policies.title"),
        blurb: t("portal.home.onboarding.steps.policies.blurb", {
          active,
          recommended,
        }),
        done: active > 0,
        chip: t("portal.home.onboarding.steps.policies.chip", { active }),
        action: { kind: "navigate", view: "policies" },
      },
      {
        id: "sources",
        title: t("portal.home.onboarding.steps.sources.title"),
        blurb: t("portal.home.onboarding.steps.sources.blurb", { connected }),
        done: connected > 0,
        chip: t("portal.home.onboarding.steps.sources.chip", { connected }),
        action: { kind: "navigate", view: "sources" },
      },
    ];
  }, [data, t]);

  const doneCount = steps.filter((s) => s.done).length;

  function activate(step: Step) {
    if (step.done) return;
    if (step.action.kind === "external") {
      window.open(step.action.href, "_blank", "noopener,noreferrer");
    } else {
      setActiveView(step.action.view);
    }
  }

  return (
    <div className="portal-setup">
      {loading && (
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

      {!loading && !dismissed && (
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
            {steps.map((s) => (
              <li key={s.id} className="portal-setup__item">
                <button
                  type="button"
                  className={
                    "portal-setup__row" +
                    (s.done ? " is-done" : " is-interactive")
                  }
                  onClick={() => activate(s)}
                  disabled={s.done}
                >
                  <span
                    className={"portal-setup__dot" + (s.done ? " is-done" : "")}
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
                    {s.done ? s.chip : t("portal.home.onboarding.notStarted")}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      <EnterpriseRung paying={tier !== "free"} onStart={onStartEnterprise} />
    </div>
  );
}
