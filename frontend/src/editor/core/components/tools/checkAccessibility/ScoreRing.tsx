import { useEffect, useState } from "react";
import type { AccessibilityGrade } from "@editor/utils/accessibilityScore";

const SIZE = 132;
const STROKE = 11;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DURATION_MS = 1100;

const GRADE_COLOR: Record<AccessibilityGrade, string> = {
  pass: "var(--c-success)",
  minor: "var(--c-success)",
  needsWork: "var(--c-warning)",
  poor: "var(--c-danger)",
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts from 0 to `target` whenever `target` or `replayKey` changes. */
function useCountUp(target: number, replayKey: string): number {
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
  }, [target, replayKey]);

  return value;
}

interface ScoreRingProps {
  score: number;
  grade: AccessibilityGrade;
  /** Changing this replays the animation even when two files share a score. */
  replayKey: string;
  label: string;
}

export function ScoreRing({ score, grade, replayKey, label }: ScoreRingProps) {
  const animated = useCountUp(score, replayKey);
  const offset = CIRCUMFERENCE * (1 - animated / 100);

  return (
    <div
      className="a11y-ring"
      role="img"
      aria-label={label}
      style={{ width: SIZE, height: SIZE }}
    >
      {/* icon-lint-allow: runtime-generated-svg -- ring arc length is computed from the score */}
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
          className="a11y-ring__arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ stroke: GRADE_COLOR[grade] }}
        />
      </svg>
      <div className="a11y-ring__value" aria-hidden="true">
        <span className="a11y-ring__number">{Math.round(animated)}</span>
        <span className="a11y-ring__out-of">/100</span>
      </div>
    </div>
  );
}
