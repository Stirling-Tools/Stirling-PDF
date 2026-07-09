import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { HomeHero } from "@portal/components/HomeHero";
import { HomeGreeting } from "@portal/components/HomeGreeting";
import { RecentActivity } from "@portal/components/RecentActivity";
import { ProcessingStatusStrip } from "@portal/components/ProcessingStatusStrip";
import { PolicySummary } from "@portal/components/PolicySummary";
import "@portal/views/Home.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Quick actions card                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

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
        <Button
          variant="quiet"
          type="button"
          className="portal-home__quick-row"
          onClick={() => setActiveView("pipelines")}
        >
          <span
            className="portal-home__quick-icon"
            style={{
              background: "var(--color-purple-light)",
              color: "var(--color-purple)",
            }}
            aria-hidden
          >
            ⌃
          </span>
          <span className="portal-home__quick-text">
            <strong>{t("portal.home.quickActions.buildPipeline.title")}</strong>
            <span>{t("portal.home.quickActions.buildPipeline.blurb")}</span>
          </span>
          <span className="portal-home__quick-arrow" aria-hidden>
            →
          </span>
        </Button>
        <Button
          variant="quiet"
          type="button"
          className="portal-home__quick-row"
          onClick={() => setActiveView("sources")}
        >
          <span
            className="portal-home__quick-icon"
            style={{
              background: "var(--color-green-light)",
              color: "var(--color-green-dark)",
            }}
            aria-hidden
          >
            ⇢
          </span>
          <span className="portal-home__quick-text">
            <strong>{t("portal.home.quickActions.connectSource.title")}</strong>
            <span>{t("portal.home.quickActions.connectSource.blurb")}</span>
          </span>
          <span className="portal-home__quick-arrow" aria-hidden>
            →
          </span>
        </Button>
        <Button
          variant="quiet"
          type="button"
          className="portal-home__quick-row"
          onClick={() => setActiveView("infrastructure")}
        >
          <span
            className="portal-home__quick-icon"
            style={{
              background: "var(--color-amber-light)",
              color: "var(--color-amber-dark)",
            }}
            aria-hidden
          >
            ⚙
          </span>
          <span className="portal-home__quick-text">
            <strong>{t("portal.home.quickActions.issueApiKey.title")}</strong>
            <span>{t("portal.home.quickActions.issueApiKey.blurb")}</span>
          </span>
          <span className="portal-home__quick-arrow" aria-hidden>
            →
          </span>
        </Button>
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
