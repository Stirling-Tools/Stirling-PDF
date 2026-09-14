/** Results pie; selecting a slice lifts it and reveals its document types. Hand-drawn
 *  SVG so the lift can animate along each slice's own bisector and carry a shadow. */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { accentColor } from "@app/utils/accentColors";
import {
  groupColour,
  type ClassificationDemoGroupCount,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";
import styles from "@app/components/onboarding/classificationDemo/classificationDemo.module.css";

const SIZE = 260;
const RADIUS = 108;
const CENTRE = SIZE / 2;
/** How far a selected slice slides along its own bisector. */
const LIFT = 12;
/** Smallest denominator the breakdown bars are measured against — see the use site. */
const BAR_SCALE_FLOOR = 5;

interface Slice {
  group: ClassificationDemoGroupCount;
  path: string;
  colour: string;
  /** Unit vector along the slice's bisector — the direction it lifts in. */
  lift: { x: number; y: number };
  midAngle: number;
}

function pointOnCircle(angle: number, radius: number) {
  return {
    x: CENTRE + radius * Math.cos(angle),
    y: CENTRE + radius * Math.sin(angle),
  };
}

/** Wedge path for one slice. A lone group spanning the full circle has no two distinct
 *  edges to arc between, so it draws as a circle rather than nothing. */
function wedgePath(start: number, end: number): string {
  if (end - start >= Math.PI * 2 - 1e-6) {
    return `M ${CENTRE} ${CENTRE - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTRE - 0.01} ${CENTRE - RADIUS} Z`;
  }
  const from = pointOnCircle(start, RADIUS);
  const to = pointOnCircle(end, RADIUS);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${CENTRE} ${CENTRE} L ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${to.x} ${to.y} Z`;
}

/** Shares {@link groupColour} with the live ticker, so the pie, its legend and the
 *  progress chips never disagree about a category's hue. */
export function useSliceColours(groups: ClassificationDemoGroupCount[]) {
  return useMemo(
    () => new Map(groups.map((group) => [group.id, groupColour(group.id)])),
    [groups],
  );
}

interface ClassificationDemoChartProps {
  groups: ClassificationDemoGroupCount[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function ClassificationDemoChart({
  groups,
  total,
  selectedId,
  onSelect,
}: ClassificationDemoChartProps) {
  const { t } = useTranslation();
  const colours = useSliceColours(groups);

  const slices = useMemo<Slice[]>(() => {
    const sum = groups.reduce((acc, group) => acc + group.count, 0) || 1;
    let angle = -Math.PI / 2; // start at 12 o'clock
    return groups.map((group) => {
      const sweep = (group.count / sum) * Math.PI * 2;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      const midAngle = start + sweep / 2;
      return {
        group,
        path: wedgePath(start, end),
        colour: colours.get(group.id) ?? accentColor("gray"),
        lift: { x: Math.cos(midAngle), y: Math.sin(midAngle) },
        midAngle,
      };
    });
  }, [groups, colours]);

  const selected = groups.find((group) => group.id === selectedId) ?? null;

  return (
    <div className={styles.chartWrap}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={styles.chart}
        role="img"
        aria-label={t(
          "classificationDemo.chart.label",
          "Documents by type: {{summary}}",
          {
            summary: groups.map((g) => `${g.name} ${g.count}`).join(", "),
          },
        )}
      >
        {slices.map((slice) => {
          const isSelected = slice.group.id === selectedId;
          const dim = selectedId !== null && !isSelected;
          return (
            <g
              key={slice.group.id}
              className={`${styles.slice} ${dim ? styles.sliceDim : ""}`}
              style={{
                transform: isSelected
                  ? `translate(${slice.lift.x * LIFT}px, ${slice.lift.y * LIFT}px)`
                  : undefined,
              }}
              onClick={() => onSelect(isSelected ? null : slice.group.id)}
              // The legend is a real button list, but the wheel is the obvious
              // target, so it takes focus too.
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(isSelected ? null : slice.group.id);
              }}
              aria-pressed={isSelected}
              aria-label={`${slice.group.name}: ${slice.group.count}`}
            >
              <path d={slice.path} fill={slice.colour} />
            </g>
          );
        })}
      </svg>

      <div className={styles.chartCentre} aria-hidden="true">
        <span className={styles.chartCentreNumber}>
          {selected ? selected.count : total}
        </span>
        <span className={styles.chartCentreLabel}>
          {selected
            ? selected.name
            : t("classificationDemo.chart.centre", "documents")}
        </span>
      </div>
    </div>
  );
}

/** The document types behind the selected family, or a prompt to pick one. */
export function ClassificationDemoBreakdown({
  group,
  colour,
}: {
  group: ClassificationDemoGroupCount | null;
  colour?: string;
}) {
  const { t } = useTranslation();

  if (!group) {
    return (
      <p className={styles.breakdownHint}>
        {t(
          "classificationDemo.chart.hint",
          "Select a slice to see the document types behind it.",
        )}
      </p>
    );
  }

  if (group.labels.length === 0) {
    return (
      <p className={styles.breakdownHint}>
        {t(
          "classificationDemo.chart.noTypes",
          "These documents did not match a known type.",
        )}
      </p>
    );
  }

  // Scale against a floor, not just the largest count: five one-off documents would
  // otherwise draw five full-width bars, reading as five maxed-out totals.
  const scale = Math.max(group.labels[0]?.count ?? 1, BAR_SCALE_FLOOR);
  return (
    <ul className={styles.breakdown}>
      {group.labels.map((label) => (
        <li key={label.id} className={styles.breakdownRow}>
          <span className={styles.breakdownName}>{label.name}</span>
          <span className={styles.breakdownBar}>
            <span
              className={styles.breakdownFill}
              style={{
                width: `${(label.count / scale) * 100}%`,
                background: colour,
              }}
            />
          </span>
          <span className={styles.breakdownCount}>{label.count}</span>
        </li>
      ))}
    </ul>
  );
}
