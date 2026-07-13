import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, SegmentedControl, Skeleton, StatusBadge } from "@app/ui";
import {
  useView,
  VIEW_PATHS,
  toPortalPath,
} from "@portal/contexts/ViewContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  fetchProcessorFlow,
  type ProcessorFlow as ProcessorFlowModel,
} from "@portal/api/processorFlow";
import {
  DEV_KEEP_FLOWING,
  DEV_SYNTH_RATE,
  type Lens,
} from "@portal/components/processor-flow/flowTypes";
import { useFlowGeometry } from "@portal/components/processor-flow/useFlowGeometry";
import { useFlowParticles } from "@portal/components/processor-flow/useFlowParticles";
import { FlowSources } from "@portal/components/processor-flow/FlowSources";
import { FlowPolicies } from "@portal/components/processor-flow/FlowPolicies";
import { FlowOutcomes } from "@portal/components/processor-flow/FlowOutcomes";
import { FlowSankey } from "@portal/components/processor-flow/FlowSankey";
import "@portal/components/ProcessorFlow.css";

/**
 * Animated processor visualiser for the home surface: connected sources on the
 * left flow through the standing policies in the middle to their audit outcomes
 * on the right. Two lenses — a live particle flow and a Sankey summary.
 *
 * This module wires the data + gating together; the moving parts live under
 * `processor-flow/`: geometry ({@link useFlowGeometry}), the rAF particle loop
 * ({@link useFlowParticles}), the three columns, and the Sankey. The flow only
 * runs when something is set up AND there's activity; an idle machine stays
 * still (unless {@link DEV_KEEP_FLOWING} forces it while iterating).
 */
export function ProcessorFlow() {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  const navigate = useNavigate();
  const { data, loading } = useAsync<ProcessorFlowModel>(
    () => fetchProcessorFlow(),
    [],
  );

  const [lens, setLens] = useState<Lens>("flow");
  const isLoading = loading && data === null;

  /** Deep-link to the Policies page and auto-open that policy's setup wizard. */
  const openPolicySetup = (key: string) =>
    navigate(
      `${toPortalPath(VIEW_PATHS.policies)}?setup=${encodeURIComponent(key)}`,
    );

  const sources = data?.sources ?? [];
  const policies = data?.policies ?? [];
  const outcomes = data?.outcomes ?? [];
  const comingSoonSources = data?.comingSoonSources ?? [];

  // ── Flow gating: run only when something is set up AND there's activity.
  const totalRate = sources.reduce((sum, s) => sum + s.docs24h, 0);
  const hasConfigured = policies.some((p) => p.configured);
  const liveFlow = hasConfigured && totalRate > 0;
  // When forcing for dev with no live flow, synthesise rates + thread every row.
  const devForced = DEV_KEEP_FLOWING && !liveFlow;
  const animate = liveFlow || devForced;

  // Particles only thread configured (active) policies; while dev-forcing with
  // no live flow, thread the available (non-locked) rows so the demo has lanes.
  const laneKeys = policies
    .filter((p) => (devForced ? p.state !== "locked" : p.state === "active"))
    .map((p) => p.key);

  const activeCount = policies.filter((p) => p.state === "active").length;
  const pdfsProcessed = outcomes.reduce((sum, o) => sum + o.count24h, 0);
  const statsLabel = t("portal.processorFlow.stats", {
    connected: sources.length,
    processed: pdfsProcessed.toLocaleString(),
  });

  // Per-source rates + outcome weights feeding the particle loop.
  const rates = sources.map((s) => (devForced ? DEV_SYNTH_RATE : s.docs24h));
  const weights = (() => {
    const raw = outcomes.map((o) => o.count24h);
    const sum = raw.reduce((a, b) => a + b, 0);
    if (sum > 0) return raw.map((v) => v / sum);
    // No real outcomes yet (dev flow): success-heavy default.
    return outcomes.map((o) => (o.key === "failed" ? 0.15 : 0.85));
  })();
  const outcomeKeys = outcomes.map((o) => o.key);

  const { wrapRef, srcRefs, outRefs, coreRef, laneRefs, geoRef, wires } =
    useFlowGeometry();
  const pGroupRef = useFlowParticles({
    geoRef,
    animate,
    lens,
    rates,
    weights,
    laneKeys,
    outcomeKeys,
  });

  return (
    <Card padding="loose" className="portal-pf">
      <header className="portal-pf__head">
        <div className="portal-pf__head-text">
          <span
            className={
              "portal-pf__live" + (animate ? " portal-pf__live--on" : "")
            }
            aria-hidden
          />
          <h2 className="portal-pf__title">
            {t("portal.processorFlow.title")}
          </h2>
          <span className="portal-pf__connected">{statsLabel}</span>
        </div>
        <div className="portal-pf__head-actions">
          <StatusBadge tone={animate ? "success" : "neutral"} size="sm">
            {t("portal.processorFlow.liveBadge")}
          </StatusBadge>
          <SegmentedControl<Lens>
            size="xs"
            value={lens}
            onChange={setLens}
            ariaLabel={t("portal.processorFlow.lens.ariaLabel")}
            options={[
              { label: t("portal.processorFlow.lens.flow"), value: "flow" },
              { label: t("portal.processorFlow.lens.sankey"), value: "sankey" },
            ]}
          />
        </div>
      </header>

      {isLoading ? (
        <div className="portal-pf__loading" aria-hidden>
          <Skeleton height="9rem" />
        </div>
      ) : lens === "sankey" ? (
        <FlowSankey
          sources={sources}
          outcomes={outcomes}
          activeCount={activeCount}
        />
      ) : (
        <div className="portal-pf__stage" ref={wrapRef}>
          <svg className="portal-pf__wires" aria-hidden>
            {wires}
          </svg>

          <div className="portal-pf__cols">
            <FlowSources
              sources={sources}
              comingSoonSources={comingSoonSources}
              srcRefs={srcRefs}
              onOpen={() => setActiveView("sources")}
            />
            <FlowPolicies
              policies={policies}
              activeCount={activeCount}
              coreRef={coreRef}
              laneRefs={laneRefs}
              onSetup={openPolicySetup}
            />
            <FlowOutcomes
              outcomes={outcomes}
              outRefs={outRefs}
              onOpen={() => setActiveView("infrastructure")}
            />
          </div>

          <svg className="portal-pf__particles" aria-hidden>
            <g ref={pGroupRef} />
          </svg>
        </div>
      )}

      <p className="portal-pf__foot">{t("portal.processorFlow.footnote")}</p>
    </Card>
  );
}
