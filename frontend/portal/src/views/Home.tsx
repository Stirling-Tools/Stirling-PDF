import { useMemo, useState } from "react";
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
  return (
    <section
      className="portal-home__product-grid"
      aria-label="Process PDFs at scale"
    >
      <ProductCard
        accent="purple"
        title="Sources"
        blurb="Attach pipelines where PDFs already live — S3, agents, SharePoint, webhooks, batch, email."
        cta="Connect a source"
        target="sources"
      />
      <ProductCard
        accent="blue"
        badge="Hero"
        title="Pipelines"
        blurb="Compose document workflows from typed operations. Upload a sample to get suggestions or start blank."
        cta="Build a pipeline"
        target="pipelines"
      />
      <ProductCard
        accent="purple"
        title="Agents"
        blurb="Wire your agent via MCP, REST, or tool definitions. Deterministic operations, scenarios, evals."
        cta="Connect an agent"
        target="sources"
      />
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Quick actions card                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

function QuickActions({ onTryOp }: { onTryOp: () => void }) {
  const { setActiveView } = useView();
  return (
    <Card padding="loose" className="portal-home__quick">
      <div className="portal-home__quick-head">
        <h2 className="portal-home__quick-title">Quick actions</h2>
        <span className="portal-home__quick-sub">Top tasks for today</span>
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
            <strong>Try a PDF operation</strong>
            <span>Drop a sample, pick an op, see the JSON</span>
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
            <strong>Build a pipeline</strong>
            <span>3-step composer over the typed op library</span>
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
            <strong>Connect a source</strong>
            <span>S3, agents, webhooks, watched folders</span>
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
            <strong>Issue an API key</strong>
            <span>Scoped key with rate limits and IP allowlist</span>
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
  const { setActiveView } = useView();
  const state = useAsync<OnboardingStep[]>(() => fetchOnboarding(), []);
  const { data: steps } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const doneCount = steps?.filter((s) => s.done).length ?? 0;

  function renderCta(step: OnboardingStep) {
    if (step.done) {
      return (
        <Button size="sm" variant="ghost" onClick={onTryOp}>
          Run again
        </Button>
      );
    }
    if (!step.cta) return null;
    if (step.cta.kind === "try-op") {
      return (
        <Button size="sm" variant="outline" onClick={onTryOp}>
          Start
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
        Start
      </Button>
    );
  }

  return (
    <Card padding="loose" className="portal-home__onboard">
      <div className="portal-home__onboard-head">
        <div>
          <h2 className="portal-home__onboard-title">Get to value</h2>
          <p className="portal-home__onboard-sub">
            Four steps to a production-shaped Stirling project.
          </p>
        </div>
        {steps && steps.length > 0 && (
          <StatusBadge tone="info" size="sm">
            {doneCount} / {steps.length} done
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
          title="No onboarding steps yet"
          description="Onboarding tasks will appear here once your workspace is set up."
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
  label: string;
  description?: string;
}

/**
 * KPI labels are product copy — they describe what each metric IS, not what
 * its current value is. Labels stay client-side so the strip's structure is
 * stable across loading / error / ready states. Only the values + deltas
 * flow through the API.
 */
const KPI_LABELS_BY_TIER: Record<Tier, KpiLabelSpec[]> = {
  free: [
    { label: "Docs processed", description: "Free plan cap" },
    { label: "Operations" },
    { label: "Pipelines" },
    { label: "Agents" },
  ],
  pro: [
    { label: "Docs / 30d" },
    { label: "Pipelines" },
    { label: "Agents active" },
    { label: "Eval pass rate" },
  ],
  enterprise: [
    { label: "Docs / 30d" },
    { label: "P95 latency" },
    { label: "Eval pass rate" },
    { label: "SLA uptime (30d)" },
  ],
};

function TierKpiStrip() {
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
            label={spec.label}
            value={fetched?.value ?? "—"}
            delta={fetched?.delta}
            deltaDirection={fetched?.deltaDirection}
            description={spec.description ?? fetched?.description}
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
  const state = useAsync<RegionHealth[]>(() => fetchRegionHealth(), []);
  const { data: regions } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  return (
    <section className="portal-home__region-block">
      <header className="portal-home__region-header">
        <h2 className="portal-home__region-title">Region health</h2>
        <p className="portal-home__region-sub">
          Real-time status for every deployed Stirling region.
        </p>
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
          title="No regions yet"
          description="Once a region is deployed, its health appears here."
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
        title="No usage yet"
        description="Once documents are processed, your 30-day usage appears here."
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

      {tier === "free" && (
        <>
          <TierKpiStrip />
          <div className="portal-home__row">
            <FreeOnboarding onTryOp={() => setRunnerOpen(true)} />
            <QuickActions onTryOp={() => setRunnerOpen(true)} />
          </div>
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
          <ProductGrid />
          <PopularUseCases />
        </>
      )}

      <SingleOpRunner open={runnerOpen} onClose={() => setRunnerOpen(false)} />
    </div>
  );
}
