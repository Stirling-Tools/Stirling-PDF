import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@app/ui";
import type {
  FlowOutcome,
  FlowOutcomeKey,
  FlowSource,
} from "@portal/api/processorFlow";
import {
  EDITOR_TYPE,
  OUTCOME_FILL,
} from "@portal/components/processor-flow/flowTypes";

interface FlowSankeyProps {
  sources: FlowSource[];
  outcomes: FlowOutcome[];
  activeCount: number;
}

/**
 * Sankey lens: sources → policies waist → outcomes, ribbon width ∝ 24h volume.
 * Shows a friendly empty state when nothing has flowed yet.
 */
export function FlowSankey({
  sources,
  outcomes,
  activeCount,
}: FlowSankeyProps) {
  const { t } = useTranslation();

  const flows = sources.filter((s) => s.docs24h > 0);
  const srcSum = flows.reduce((sum, s) => sum + s.docs24h, 0);
  if (!srcSum) {
    return (
      <div className="portal-pf__sankey-empty">
        <EmptyState
          size="compact"
          title={t("portal.processorFlow.sankey.empty.title")}
          description={t("portal.processorFlow.sankey.empty.description")}
        />
      </div>
    );
  }

  const SW = 720;
  const SH = 220;
  const padY = 22;
  const xL = 180;
  const xR = 560;
  const xM = (xL + xR) / 2;
  const barW = 9;
  const midW = 11;
  const gap = 12;
  const H = SH - padY * 2;

  const k = (H - (flows.length - 1) * gap) / srcSum;
  const lt = flows.map((s) => Math.max(3, s.docs24h * k));
  const midH = lt.reduce((a, b) => a + b, 0);
  const y0L = padY + (H - (midH + (flows.length - 1) * gap)) / 2;
  const midY = padY + (H - midH) / 2;

  const outSum = outcomes.reduce((a, o) => a + o.count24h, 0);
  const rawRt = outcomes.map((o) =>
    outSum > 0
      ? Math.max(3, midH * (o.count24h / outSum))
      : midH / outcomes.length,
  );
  const rtSum = rawRt.reduce((a, b) => a + b, 0);
  const rt = rawRt.map((v) => (v * midH) / rtSum);
  const y0R = padY + (H - (midH + (outcomes.length - 1) * gap)) / 2;

  const outFill = (key: FlowOutcomeKey) => OUTCOME_FILL[key];
  const srcFill = "var(--color-blue)";
  const waistFill = "var(--color-text-4)";

  const ribbon = (
    x0: number,
    t0: number,
    b0: number,
    x1: number,
    t1: number,
    b1: number,
    fill: string,
    key: string,
  ) => {
    const mx = (x0 + x1) / 2;
    return (
      <path
        key={key}
        d={`M ${x0} ${t0} C ${mx} ${t0}, ${mx} ${t1}, ${x1} ${t1} L ${x1} ${b1} C ${mx} ${b1}, ${mx} ${b0}, ${x0} ${b0} Z`}
        style={{ fill }}
        opacity={0.3}
      />
    );
  };

  const wires: ReactNode[] = [];
  const bars: ReactNode[] = [];
  const texts: ReactNode[] = [];

  // Left stage: sources → waist.
  let accL = y0L;
  let accM = midY;
  flows.forEach((s, i) => {
    wires.push(
      ribbon(
        xL + barW,
        accL,
        accL + lt[i],
        xM,
        accM,
        accM + lt[i],
        srcFill,
        "wl" + i,
      ),
    );
    bars.push(
      <rect
        key={"bl" + i}
        x={xL}
        y={accL}
        width={barW}
        height={lt[i]}
        rx={2}
        style={{ fill: srcFill }}
        opacity={0.9}
      />,
    );
    const label =
      s.type === EDITOR_TYPE
        ? t("portal.processorFlow.sources.editor")
        : s.name;
    texts.push(
      <text
        key={"tl" + i}
        x={xL - 10}
        y={accL + lt[i] / 2 + 4}
        textAnchor="end"
        className="portal-pf__sankey-label"
      >
        {label} · {s.docs24h}
      </text>,
    );
    accL += lt[i] + gap;
    accM += lt[i];
  });

  // Waist node.
  bars.push(
    <rect
      key="waist"
      x={xM}
      y={midY}
      width={midW}
      height={midH}
      rx={2}
      style={{ fill: waistFill }}
      opacity={0.9}
    />,
  );
  texts.push(
    <text
      key="waist-cap"
      x={xM + midW / 2}
      y={midY - 8}
      textAnchor="middle"
      className="portal-pf__sankey-caption"
    >
      {t("portal.processorFlow.sankey.waist", { n: activeCount })}
    </text>,
  );

  // Right stage: waist → outcomes.
  let accWaist = midY;
  let accR = y0R;
  outcomes.forEach((o, j) => {
    wires.push(
      ribbon(
        xM + midW,
        accWaist,
        accWaist + rt[j],
        xR,
        accR,
        accR + rt[j],
        outFill(o.key),
        "wr" + j,
      ),
    );
    bars.push(
      <rect
        key={"br" + j}
        x={xR}
        y={accR}
        width={barW}
        height={rt[j]}
        rx={2}
        style={{ fill: outFill(o.key) }}
        opacity={0.9}
      />,
    );
    texts.push(
      <text
        key={"tr" + j}
        x={xR + barW + 10}
        y={accR + rt[j] / 2 + 4}
        textAnchor="start"
        className="portal-pf__sankey-label"
      >
        {t(o.labelKey)} · {o.count24h}
      </text>,
    );
    accWaist += rt[j];
    accR += rt[j] + gap;
  });

  return (
    <div className="portal-pf__sankey">
      <svg viewBox={`0 0 ${SW} ${SH}`} width="100%" aria-hidden>
        {wires}
        {bars}
        {texts}
      </svg>
    </div>
  );
}
