import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchPolicies, type PoliciesResponse } from "@portal/api/policies";
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
  /** The in-app surface this step opens. */
  view: ViewId;
}

/**
 * Numbered getting-started steps, rendered as the body of the home hero. Each
 * row is a shortcut that opens its in-app surface — download/deploy the editor,
 * confirm policies, invite teammates — so the card is a quick-start, not a
 * completion tracker. The policies blurb carries live counts (the same data the
 * Policies page shows). The Enterprise rung sits at the foot regardless of tier.
 */
export function SetupChecklist() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();

  // Only the policies step shows live numbers; sources was dropped from the
  // top-three to match the simplified marketing card.
  const { data } = useAsync<PoliciesResponse>(() => fetchPolicies(), []);
  const active = data?.summary.active ?? 0;
  const recommended = Math.max(0, (data?.summary.categories ?? 0) - active);

  const steps = useMemo<Step[]>(
    () => [
      {
        id: "editor",
        title: t("portal.home.onboarding.steps.editor.title"),
        blurb: t("portal.home.onboarding.steps.editor.blurb"),
        view: "editor",
      },
      {
        id: "policies",
        title: t("portal.home.onboarding.steps.policies.title"),
        blurb: t("portal.home.onboarding.steps.policies.blurb", {
          active,
          recommended,
        }),
        view: "policies",
      },
      {
        id: "invite",
        title: t("portal.home.onboarding.steps.invite.title"),
        blurb: t("portal.home.onboarding.steps.invite.blurb"),
        view: "users",
      },
    ],
    [t, active, recommended],
  );

  return (
    <div className="portal-setup">
      <ol className="portal-setup__list">
        {steps.map((s, i) => (
          <li key={s.id} className="portal-setup__item">
            <button
              type="button"
              className="portal-setup__row"
              onClick={() => setActiveView(s.view)}
            >
              <span className="portal-setup__num" aria-hidden>
                {i + 1}
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
    </div>
  );
}
