import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  MetricCard,
  MetricStrip,
  Skeleton,
  StatusBadge,
} from "@shared/components";
import { useTier, type Tier } from "@portal/contexts/TierContext";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchHomeKpis,
  fetchOnboarding,
  fetchRegionHealth,
  fetchUsageSeries,
  type KpiEntry,
  type OnboardingStep,
  type RegionHealth,
  type UsageSeriesResponse,
} from "@portal/api/home";
import { WelcomeCarousel } from "@portal/components/WelcomeCarousel";
import { PopularUseCases } from "@portal/components/PopularUseCases";
import { UsageAreaChart } from "@portal/components/UsageAreaChart";
import { RecentActivity } from "@portal/components/RecentActivity";
import { SingleOpRunner } from "@portal/components/SingleOpRunner";
import { ProcessingStatusStrip } from "@portal/components/ProcessingStatusStrip";
import { PolicySummary } from "@portal/components/PolicySummary";
import { PipelineForkWizard } from "@portal/components/PipelineForkWizard";
import "@portal/views/Home.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Product cards (Sources / Pipelines / Agents)                             */
/* ──────────────────────────────────────────────────────────────────────── */

interface ProductCardProps {
  accent: "blue" | "purple";
  badge?: string;
  title: string;
  blurb: string;
  cta: string;
  target: ViewId;
}

function ProductCard({
  accent,
  badge,
  title,
  blurb,
  cta,
  target,
}: ProductCardProps) {
  const { setActiveView } = useView();
  return (
    <Card accent={accent} padding="loose" interactive>
      <div className="portal-home__product-head">
        <h3 className="portal-home__product-title">{title}</h3>
        {badge && (
          <StatusBadge tone={accent === "blue" ? "info" : "purple"} size="sm">
            {badge}
          </StatusBadge>
        )}
      </div>
      <p className="portal-home__product-blurb">{blurb}</p>
      <Button
        variant="outline"
        accent={accent}
        size="sm"
        onClick={() => setActiveView(target)}
        trailingIcon={<span aria-hidden>→</span>}
      >
        {cta}
      </Button>
    </Card>
  );
}

function ProductGrid() {
  const { t } = useTranslation();
  return (
    <section
      className="portal-home__product-grid"
      aria-label={t("home.productGrid.ariaLabel")}
    >
      <ProductCard
        accent="purple"
        title={t("home.productGrid.sources.title")}
        blurb={t("home.productGrid.sources.blurb")}
        cta={t("home.productGrid.sources.cta")}
        target="sources"
      />
      <ProductCard
        accent="blue"
        badge={t("home.productGrid.pipelines.badge")}
        title={t("home.productGrid.pipelines.title")}
        blurb={t("home.productGrid.pipelines.blurb")}
        cta={t("home.productGrid.pipelines.cta")}
        target="pipelines"
      />
      <ProductCard
        accent="purple"
        title={t("home.productGrid.agents.title")}
        blurb={t("home.productGrid.agents.blurb")}
        cta={t("home.productGrid.agents.cta")}
        target="sources"
      />
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Quick actions card                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

function QuickActions({ onTryOp }: { onTryOp: () => void }) {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  return (
    <Card padding="loose" className="portal-home__quick">
      <div className="portal-home__quick-head">
        <h2 className="portal-home__quick-title">
          {t("home.quickActions.title")}
        </h2>
        <span className="portal-home__quick-sub">
          {t("home.quickActions.subtitle")}
        </span>
      </div>
      <div className="portal-home__quick-list">
        <button
          type="button"
          className="portal-home__quick-row"
          onClick={onTryOp}
        >
          <span
            className="portal-home__quick-icon"
            style={{
              background: "var(--color-blue-light)",
              color: "var(--color-blue)",
            }}
            aria-hidden
          >
            ▶
          </span>
          <span className="portal-home__quick-text">
            <strong>{t("home.quickActions.tryOp.title")}</strong>
            <span>{t("home.quickActions.tryOp.blurb")}</span>
          </span>
          <span className="portal-home__quick-arrow" aria-hidden>
            →
          </span>
        </button>
        <button
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
            <strong>{t("home.quickActions.buildPipeline.title")}</strong>
            <span>{t("home.quickActions.buildPipeline.blurb")}</span>
          </span>
          <span className="portal-home__quick-arrow" aria-hidden>
            →
          </span>
        </button>
        <button
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
            <strong>{t("home.quickActions.connectSource.title")}</strong>
            <span>{t("home.quickActions.connectSource.blurb")}</span>
          </span>
          <span className="portal-home__quick-arrow" aria-hidden>
            →
          </span>
        </button>
        <button
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
            <strong>{t("home.quickActions.issueApiKey.title")}</strong>
            <span>{t("home.quickActions.issueApiKey.blurb")}</span>
          </span>
          <span className="portal-home__quick-arrow" aria-hidden>
            →
          </span>
        </button>
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Free-tier onboarding checklist                                           */
/* ──────────────────────────────────────────────────────────────────────── */

function FreeOnboarding({ onTryOp }: { onTryOp: () => void }) {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  const state = useAsync<OnboardingStep[]>(() => fetchOnboarding(), []);
  const { data: steps } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const doneCount = steps?.filter((s) => s.done).length ?? 0;

  function renderCta(step: OnboardingStep) {
    if (step.done) {
      return (
        <Button size="sm" variant="ghost" onClick={onTryOp}>
          {t("home.onboarding.runAgain")}
        </Button>
      );
    }
    if (!step.cta) return null;
    if (step.cta.kind === "try-op") {
      return (
        <Button size="sm" variant="outline" onClick={onTryOp}>
          {t("home.onboarding.start")}
        </Button>
      );
    }
    const target = step.cta.target;
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setActiveView(target as ViewId)}
      >
        {t("home.onboarding.start")}
      </Button>
    );
  }

  return (
    <Card padding="loose" className="portal-home__onboard">
      <div className="portal-home__onboard-head">
        <div>
          <h2 className="portal-home__onboard-title">
            {t("home.onboarding.title")}
          </h2>
          <p className="portal-home__onboard-sub">
            {t("home.onboarding.subtitle")}
          </p>
        </div>
        {steps && steps.length > 0 && (
          <StatusBadge tone="info" size="sm">
            {t("home.onboarding.progress", {
              done: doneCount,
              total: steps.length,
            })}
          </StatusBadge>
        )}
      </div>

      {isLoading && (
        <ol className="portal-home__onboard-list" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={`skel-${i}`}
              className="portal-home__onboard-step is-loading"
            >
              <span className="portal-home__onboard-mark" />
              <div className="portal-home__onboard-text">
                <div className="portal-home__onboard-skel" />
              </div>
            </li>
          ))}
        </ol>
      )}

      {isEmpty && (
        <EmptyState
          size="compact"
          title={t("home.onboarding.empty.title")}
          description={t("home.onboarding.empty.description")}
        />
      )}

      {steps && steps.length > 0 && (
        <ol className="portal-home__onboard-list">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={
                "portal-home__onboard-step" + (s.done ? " is-done" : "")
              }
            >
              <span className="portal-home__onboard-mark">
                {s.done ? "✓" : i + 1}
              </span>
              <div className="portal-home__onboard-text">
                <strong>{s.title}</strong>
                <span>{s.blurb}</span>
              </div>
              {renderCta(s)}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tier KPI strip                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

interface KpiLabelSpec {
  labelKey: string;
  descriptionKey?: string;
}

/**
 * KPI labels are product copy — they describe what each metric IS, not what
 * its current value is. Labels stay client-side so the strip's structure is
 * stable across loading / error / ready states. Only the values + deltas
 * flow through the API. Stored as i18n keys, resolved at render time.
 */
const KPI_LABELS_BY_TIER: Record<Tier, KpiLabelSpec[]> = {
  free: [
    {
      labelKey: "home.kpis.free.docsProcessed",
      descriptionKey: "home.kpis.free.docsProcessedDescription",
    },
    { labelKey: "home.kpis.free.operations" },
    { labelKey: "home.kpis.free.pipelines" },
    { labelKey: "home.kpis.free.agents" },
  ],
  pro: [
    { labelKey: "home.kpis.pro.docs30d" },
    { labelKey: "home.kpis.pro.pipelines" },
    { labelKey: "home.kpis.pro.agentsActive" },
    { labelKey: "home.kpis.pro.evalPassRate" },
  ],
  enterprise: [
    { labelKey: "home.kpis.enterprise.docs30d" },
    { labelKey: "home.kpis.enterprise.p95Latency" },
    { labelKey: "home.kpis.enterprise.evalPassRate" },
    { labelKey: "home.kpis.enterprise.slaUptime" },
  ],
};

function TierKpiStrip() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const labels = KPI_LABELS_BY_TIER[tier];
  const { data: kpis, loading } = useAsync<KpiEntry[]>(
    () => fetchHomeKpis(tier),
    [tier],
  );

  return (
    <MetricStrip>
      {labels.map((spec, i) => {
        // useAsync keeps the previous tier's data during a refetch; ignore it
        // while loading so the new labels never pair with stale values.
        const fetched = loading ? undefined : kpis?.[i];
        return (
          <MetricCard
            key={`${tier}-${i}`}
            label={t(spec.labelKey)}
            value={fetched?.value ?? "—"}
            delta={fetched?.delta}
            deltaDirection={fetched?.deltaDirection}
            description={
              spec.descriptionKey
                ? t(spec.descriptionKey)
                : fetched?.description
            }
          />
        );
      })}
    </MetricStrip>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Enterprise region health                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

const REGION_DOT: Record<RegionHealth["status"], string> = {
  healthy: "var(--color-green)",
  degraded: "var(--color-amber)",
  down: "var(--color-red)",
};

function EnterpriseRegions() {
  const { t } = useTranslation();
  const state = useAsync<RegionHealth[]>(() => fetchRegionHealth(), []);
  const { data: regions } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  return (
    <section className="portal-home__region-block">
      <header className="portal-home__region-header">
        <h2 className="portal-home__region-title">{t("home.regions.title")}</h2>
        <p className="portal-home__region-sub">{t("home.regions.subtitle")}</p>
      </header>

      {isLoading && (
        <div className="portal-home__regions" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="portal-home__region">
              <Skeleton width="6rem" />
              <Skeleton width="80%" height="0.625rem" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          size="compact"
          title={t("home.regions.empty.title")}
          description={t("home.regions.empty.description")}
        />
      )}

      {regions && regions.length > 0 && (
        <div className="portal-home__regions">
          {regions.map((r) => (
            <div key={r.name} className="portal-home__region">
              <div className="portal-home__region-name">
                <span
                  className="portal-home__region-dot"
                  style={{ background: REGION_DOT[r.status] }}
                  aria-hidden
                />
                {r.name}
                <span className="sr-only">{` — ${r.status}`}</span>
              </div>
              <div className="portal-home__region-meta">{r.meta}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Chart section                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

function ChartSection() {
  const { t } = useTranslation();
  const state = useAsync<UsageSeriesResponse>(() => fetchUsageSeries(), []);
  const { data: usage } = state;
  const { isLoading } = useSectionFlags(state);

  const docs30d = useMemo(
    () => usage?.points.reduce((sum, p) => sum + p.value, 0) ?? 0,
    [usage],
  );
  const deltaPct = useMemo(() => {
    if (!usage || usage.priorTotal <= 0) return undefined;
    return (docs30d - usage.priorTotal) / usage.priorTotal;
  }, [usage, docs30d]);

  if (isLoading) {
    return (
      <div className="portal-chart">
        <Skeleton width="12rem" height="0.875rem" />
        <Skeleton width="7rem" height="1.75rem" />
        <Skeleton height="15rem" />
      </div>
    );
  }

  if (!usage || usage.points.length === 0) {
    return (
      <EmptyState
        title={t("home.chart.empty.title")}
        description={t("home.chart.empty.description")}
      />
    );
  }

  return (
    <UsageAreaChart
      data={usage.points}
      totalValue={docs30d.toLocaleString()}
      deltaPct={deltaPct}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Home view                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

export function Home() {
  const { tier } = useTier();
  const [runnerOpen, setRunnerOpen] = useState(false);

  return (
    <div className="portal-home">
      <WelcomeCarousel onTryOp={() => setRunnerOpen(true)} />
      <ProcessingStatusStrip />

      {tier === "free" && (
        <>
          <TierKpiStrip />
          <div className="portal-home__row">
            <FreeOnboarding onTryOp={() => setRunnerOpen(true)} />
            <QuickActions onTryOp={() => setRunnerOpen(true)} />
          </div>
          <PolicySummary />
          <PipelineForkWizard />
          <ProductGrid />
          <PopularUseCases />
        </>
      )}

      {tier === "pro" && (
        <>
          <ChartSection />
          <TierKpiStrip />
          <div className="portal-home__row">
            <RecentActivity />
            <QuickActions onTryOp={() => setRunnerOpen(true)} />
          </div>
          <PolicySummary />
          <PipelineForkWizard />
          <ProductGrid />
          <PopularUseCases />
        </>
      )}

      {tier === "enterprise" && (
        <>
          <ChartSection />
          <TierKpiStrip />
          <EnterpriseRegions />
          <div className="portal-home__row">
            <RecentActivity />
            <QuickActions onTryOp={() => setRunnerOpen(true)} />
          </div>
          <PolicySummary />
          <PipelineForkWizard />
          <ProductGrid />
          <PopularUseCases />
        </>
      )}

      <SingleOpRunner open={runnerOpen} onClose={() => setRunnerOpen(false)} />
    </div>
  );
}
