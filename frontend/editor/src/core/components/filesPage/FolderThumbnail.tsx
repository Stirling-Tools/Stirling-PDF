/**
 * Stylised folder thumbnail.
 *
 * A custom SVG folder shape that takes its accent colour from
 * `FolderRecord.color` and shows the contained-file count as a small badge
 * in the corner. Renders proportionally inside whatever container it's
 * placed in (file card thumb, list-row icon).
 */

import React, { useId } from "react";

interface FolderThumbnailProps {
  color?: string;
  fileCount?: number;
  /** Visual scale - "thumb" for cards, "row" for list rows, "tree" for nav. */
  size?: "thumb" | "row" | "tree";
  /** Optional glyph (emoji) overlaid in the centre of the front pocket. */
  iconGlyph?: string;
}

const SIZE_PX: Record<NonNullable<FolderThumbnailProps["size"]>, number> = {
  thumb: 96,
  row: 22,
  tree: 18,
};

export function FolderThumbnail({
  color,
  fileCount,
  size = "thumb",
  iconGlyph,
}: FolderThumbnailProps) {
  const accent = color ?? "var(--accent-interactive, #6366f1)";
  const px = SIZE_PX[size];
  const showBadge = size === "thumb" && (fileCount ?? 0) > 0;
  // Per-instance unique ids - `${color}` previously embedded `#` and CSS
  // function syntax in the id, which broke `url(#...)` references (Safari
  // would parse the inner `#` as a new fragment start and the lookup
  // would miss entirely, leaving the folder shape unfilled).
  const reactId = useId();
  const backId = `${reactId}-back`;
  const frontId = `${reactId}-front`;

  return (
    <div
      style={{
        position: "relative",
        width: px,
        height: Math.round(px * 0.8),
        display: "inline-block",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 80"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient id={backId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id={frontId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.85" />
            <stop offset="100%" stopColor={accent} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Back panel - symmetric viewBox so the folder is visually
            centred (6px breathing room on every side). */}
        <path
          d="M4 12 Q4 6 10 6 H38 L46 14 H90 Q96 14 96 20 V68 Q96 74 90 74 H10 Q4 74 4 68 Z"
          fill={`url(#${backId})`}
        />

        {/* Paper peeking out (lighter) */}
        <rect
          x="14"
          y="22"
          width="72"
          height="36"
          rx="4"
          fill="rgba(255, 255, 255, 0.85)"
        />
        <rect
          x="18"
          y="18"
          width="64"
          height="32"
          rx="4"
          fill="rgba(255, 255, 255, 0.55)"
        />

        {/* Front pocket */}
        <path
          d="M4 30 Q4 24 10 24 H90 Q96 24 96 30 V68 Q96 74 90 74 H10 Q4 74 4 68 Z"
          fill={`url(#${frontId})`}
        />

        {/* Subtle highlight on the lip */}
        <path
          d="M4 30 Q4 24 10 24 H90 Q96 24 96 30 V32 H4 Z"
          fill="rgba(255, 255, 255, 0.18)"
        />
      </svg>

      {iconGlyph && size === "thumb" && (
        <span
          style={{
            position: "absolute",
            inset: "28% 0 0 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: `${px * 0.28}px`,
            lineHeight: 1,
            pointerEvents: "none",
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
          }}
          aria-hidden="true"
        >
          {iconGlyph}
        </span>
      )}
      {iconGlyph && size === "row" && (
        <span
          style={{
            position: "absolute",
            inset: "30% 0 0 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: `${px * 0.45}px`,
            lineHeight: 1,
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          {iconGlyph}
        </span>
      )}
      {showBadge && (
        <span
          style={{
            position: "absolute",
            top: "-0.35rem",
            right: "-0.35rem",
            minWidth: "1.4rem",
            height: "1.4rem",
            borderRadius: "999px",
            background: "var(--bg-surface, #fff)",
            border: `1px solid ${accent}`,
            color: accent,
            fontSize: "0.7rem",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 0.35rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            lineHeight: 1,
          }}
        >
          {fileCount}
        </span>
      )}
    </div>
  );
}
