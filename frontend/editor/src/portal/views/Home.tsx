import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { HomeHero } from "@portal/components/HomeHero";
import { HomeGreeting } from "@portal/components/HomeGreeting";
import { ProcessorFlow } from "@portal/components/ProcessorFlow";
import { RecentActivity } from "@portal/components/RecentActivity";
import { ProcessingStatusStrip } from "@portal/components/ProcessingStatusStrip";
import { PolicySummary } from "@portal/components/PolicySummary";
import "@portal/views/Home.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Quick actions card                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

/** Rows for the Quick Actions list. Each `view` navigates the portal. */
const QUICK_ACTIONS: Array<{
  key: string;
  glyph: string;
  bg: string;
  fg: string;
  view: ViewId;
}> = [
  {
    key: "buildPipeline",
    glyph: "⌃",
    bg: "var(--color-purple-light)",
    fg: "var(--color-purple)",
    view: "pipelines",
  },
  {
    key: "connectSource",
    glyph: "⇢",
    bg: "var(--color-green-light)",
    fg: "var(--color-green-dark)",
    view: "sources",
  },
  {
    key: "issueApiKey",
    glyph: "⚙",
    bg: "var(--color-amber-light)",
    fg: "var(--color-amber-dark)",
    view: "infrastructure",
  },
];

function QuickActions() {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  return (
    <Card padding="loose" className="portal-home__quick">
      <div className="portal-home__quick-head">
        <h2 className="portal-home__quick-title">
          {t("portal.home.quickActions.title")}
        </h2>
        <span className="portal-home__quick-sub">
          {t("portal.home.quickActions.subtitle")}
        </span>
      </div>
      <div className="portal-home__quick-list">
        {QUICK_ACTIONS.map((action) => (
          <Button
            key={action.key}
            variant="quiet"
            justify="start"
            fullWidth
            px="sm"
            py="sm"
            type="button"
            className="portal-home__quick-row"
            onClick={() => setActiveView(action.view)}
            leftSection={
              <span
                className="portal-home__quick-icon"
                style={{ background: action.bg, color: action.fg }}
                aria-hidden
              >
                {action.glyph}
              </span>
            }
            rightSection={
              <span className="portal-home__quick-arrow" aria-hidden>
                →
              </span>
            }
          >
            <span className="portal-home__quick-text">
              <strong>
                {t(`portal.home.quickActions.${action.key}.title`)}
              </strong>
              <span>{t(`portal.home.quickActions.${action.key}.blurb`)}</span>
            </span>
          </Button>
        ))}
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Home view                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

export function Home() {
  const { tier } = useTier();

  return (
    <div className="portal-home">
      {/* Paid tiers open with a greeting; free opens straight with the banner. */}
      {tier !== "free" && <HomeGreeting />}

      {/* Per-tier hero. Its footer is the deal-status hero while a procurement
          deal is underway (a bolt-on to any tier), otherwise the setup checklist. */}
      <HomeHero tier={tier} />
      <ProcessorFlow />

      {/* One unified layout across tiers: real processed-PDF volume, real audit
          activity, quick actions, and the standing-policy summary. */}
      <ProcessingStatusStrip />
      <div className="portal-home__row">
        <RecentActivity />
        <QuickActions />
      </div>
      <PolicySummary />
    </div>
  );
}
