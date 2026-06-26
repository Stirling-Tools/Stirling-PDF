import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { UsagePoint } from "@portal/api/home";
import "@portal/components/UsageAreaChart.css";

interface UsageAreaChartProps {
  data: UsagePoint[];
  /** Headline metric shown above the chart (e.g. total 30d, current value). */
  totalLabel?: string;
  totalValue?: string;
  deltaPct?: number;
}

const PADDING = { top: 16, right: 20, bottom: 28, left: 32 } as const;
const VIEW = { width: 800, height: 240 } as const;

function formatTick(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatNumber(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return value.toLocaleString();
}

export function UsageAreaChart({
  data,
  totalLabel: totalLabelProp,
  totalValue,
  deltaPct,
}: UsageAreaChartProps) {
  const { t } = useTranslation();
  const totalLabel = totalLabelProp ?? t("usageChart.defaultLabel");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const { points, areaPath, linePath, yMax, yTicks, xTickIndices } =
    useMemo(() => {
      if (data.length === 0) {
        return {
          points: [] as Array<{ x: number; y: number; raw: UsagePoint }>,
          areaPath: "",
          linePath: "",
          yMax: 0,
          yTicks: [] as number[],
          xTickIndices: [] as number[],
        };
      }
      const max = Math.max(...data.map((d) => d.value));
      // Round yMax up to a "nice" number for ticks. Floor at 500 so an
      // all-zero series doesn't divide by zero (which would NaN every point).
      const niceMax = Math.max(Math.ceil(max / 500) * 500, 500);
      const yTicksCalc = [0, niceMax * 0.5, niceMax];

      const innerW = VIEW.width - PADDING.left - PADDING.right;
      const innerH = VIEW.height - PADDING.top - PADDING.bottom;
      const xStep = innerW / Math.max(data.length - 1, 1);

      const pts = data.map((raw, i) => ({
        x: PADDING.left + i * xStep,
        y: PADDING.top + innerH - (raw.value / niceMax) * innerH,
        raw,
      }));

      const linePathStr = pts
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`,
        )
        .join(" ");
      const baseY = PADDING.top + innerH;
      const areaPathStr = `${linePathStr} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`;

      // X ticks: 5 evenly spread.
      const xIdx: number[] = [];
      const tickCount = 5;
      for (let t = 0; t < tickCount; t++) {
        xIdx.push(Math.round((t * (data.length - 1)) / (tickCount - 1)));
      }

      return {
        points: pts,
        areaPath: areaPathStr,
        linePath: linePathStr,
        yMax: niceMax,
        yTicks: yTicksCalc,
        xTickIndices: xIdx,
      };
    }, [data]);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const svgX = xRatio * VIEW.width;
    // Find nearest point
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - svgX);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    setHoverIndex(nearestIdx);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHoverIndex((idx) =>
        idx === null ? 0 : Math.min(points.length - 1, idx + 1),
      );
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHoverIndex((idx) =>
        idx === null ? points.length - 1 : Math.max(0, idx - 1),
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      setHoverIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHoverIndex(points.length - 1);
    } else if (e.key === "Escape") {
      setHoverIndex(null);
    }
  }

  const displayTotal =
    totalValue ?? data.reduce((sum, p) => sum + p.value, 0).toLocaleString();

  return (
    <div className="portal-chart">
      <header className="portal-chart__head">
        <div>
          <div className="portal-chart__label">{totalLabel}</div>
          <div className="portal-chart__value">{displayTotal}</div>
        </div>
        {deltaPct !== undefined && (
          <div
            className={
              "portal-chart__delta " + (deltaPct >= 0 ? "is-up" : "is-down")
            }
          >
            <span aria-hidden>{deltaPct >= 0 ? "↑" : "↓"}</span>
            {t("usageChart.delta", {
              pct: Math.abs(Math.round(deltaPct * 100)),
            })}
          </div>
        )}
      </header>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={totalLabel}
        className="portal-chart__svg"
        tabIndex={points.length > 0 ? 0 : -1}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-blue)"
              stopOpacity="0.32"
            />
            <stop offset="100%" stopColor="var(--color-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels */}
        {yTicks.map((tick) => {
          const innerH = VIEW.height - PADDING.top - PADDING.bottom;
          const y = PADDING.top + innerH - (tick / yMax) * innerH;
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={VIEW.width - PADDING.right}
                y1={y}
                y2={y}
                className="portal-chart__gridline"
              />
              <text
                x={PADDING.left - 6}
                y={y + 4}
                className="portal-chart__axis-label"
                textAnchor="end"
              >
                {formatNumber(tick)}
              </text>
            </g>
          );
        })}

        {/* Area + line */}
        <path d={areaPath} fill="url(#chart-fill)" />
        <path d={linePath} className="portal-chart__line" />

        {/* X ticks */}
        {xTickIndices.map((idx) => {
          const p = points[idx];
          if (!p) return null;
          return (
            <text
              key={idx}
              x={p.x}
              y={VIEW.height - PADDING.bottom + 18}
              className="portal-chart__axis-label"
              textAnchor="middle"
            >
              {formatTick(p.raw.date)}
            </text>
          );
        })}

        {/* Hover scrub + dot + tooltip */}
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PADDING.top}
              y2={VIEW.height - PADDING.bottom}
              className="portal-chart__scrub"
            />
            <circle
              cx={hovered.x}
              cy={hovered.y}
              r={4}
              className="portal-chart__dot"
            />
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="portal-chart__tooltip"
          style={{
            left: `${(hovered.x / VIEW.width) * 100}%`,
          }}
        >
          <div className="portal-chart__tooltip-date">
            {new Date(hovered.raw.date).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="portal-chart__tooltip-value">
            {t("usageChart.docsValue", {
              value: hovered.raw.value.toLocaleString(),
            })}
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {hovered
          ? t("usageChart.srAnnounce", {
              date: new Date(hovered.raw.date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              }),
              value: hovered.raw.value.toLocaleString(),
            })
          : ""}
      </div>
    </div>
  );
}
