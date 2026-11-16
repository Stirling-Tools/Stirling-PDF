import { useEffect, useState } from "react";
import type { AccessibilityResult } from "@editor/utils/accessibilityAssessment";

const SIZE = 112;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DURATION_MS = 1100;

const RESULT_COLOR: Record<AccessibilityResult, string> = {
  pass: "var(--c-success)",
  partial: "var(--c-warning)",
  fail: "var(--c-danger)",
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts from 0 to `target` on mount and whenever `target` changes. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      setValue(target * easeOutCubic(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

interface ChecksRingProps {
  passed: number;
  total: number;
  result: AccessibilityResult;
  label: string;
}

export function ChecksRing({ passed, total, result, label }: ChecksRingProps) {
  const animated = useCountUp(passed);
  const offset = CIRCUMFERENCE * (1 - (total > 0 ? animated / total : 0));

  return (
    <div
      className="a11y-ring"
      role="img"
      aria-label={label}
      style={{ width: SIZE, height: SIZE }}
    >
      {/* icon-lint-allow: runtime-generated-svg -- ring arc length is computed from the checks passed */}
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        <circle
          className="a11y-ring__track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ stroke: RESULT_COLOR[result] }}
          opacity={animated > 0 ? 1 : 0}
        />
      </svg>
      <div className="a11y-ring__value" aria-hidden="true">
        <span className="a11y-ring__number">{Math.round(animated)}</span>
        <span className="a11y-ring__out-of">/{total}</span>
      </div>
    </div>
  );
}
