import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { HomeHero } from "@portal/components/HomeHero";
import { HomeGreeting } from "@portal/components/HomeGreeting";
import { RecentActivity } from "@portal/components/RecentActivity";
import { ProcessingStatusStrip } from "@portal/components/ProcessingStatusStrip";
import { PolicySummary } from "@portal/components/PolicySummary";
import "@portal/views/Home.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Quick actions card                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

/** A stroke icon used inside the quick-action badge (replaces the old text
    glyphs ⌃ ⇢ ⚙, which rendered off-style vs the portal's icon set). */
function QuickIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/** Rows for the Quick Actions list. Each `view` navigates the portal. */
const QUICK_ACTIONS: Array<{
  key: string;
  iconD: string;
  bg: string;
  fg: string;
  view: ViewId;
}> = [
  {
    key: "buildPipeline",
    iconD:
      "M6 4a2 2 0 100 4 2 2 0 000-4zM18 16a2 2 0 100 4 2 2 0 000-4zM6 8v6a4 4 0 004 4h4",
    bg: "var(--color-purple-light)",
    fg: "var(--color-purple)",
    view: "pipelines",
  },
  {
    key: "connectSource",
    iconD:
      "M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1",
    bg: "var(--color-green-light)",
    fg: "var(--color-green-dark)",
    view: "sources",
  },
  {
    key: "issueApiKey",
    iconD:
      "M2.6 17.4A2 2 0 002 18.8V21a1 1 0 001 1h3a1 1 0 001-1v-1a1 1 0 011-1h1a1 1 0 001-1v-1a1 1 0 011-1h.2a2 2 0 001.4-.6l.8-.8a6.5 6.5 0 10-4-4z M16.5 7.5 h.01",
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
                <QuickIcon d={action.iconD} />
              </span>
            }
            rightSection={
              <span className="portal-home__quick-arrow" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
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
