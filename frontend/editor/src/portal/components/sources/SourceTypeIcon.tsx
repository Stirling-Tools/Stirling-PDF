import type { ReactNode } from "react";

/**
 * Stroke-SVG icons for source types, replacing the black Unicode glyphs
 * (⛁ ☁ ✏ ◇) that rendered off-style and mis-centred inside the type tiles and
 * table badges. Keyed by the backend source `type`; unknown types fall back to
 * a neutral document mark. Drawn to match the portal icon set (icons.tsx):
 * 24×24 viewBox, currentColor stroke, round caps/joins.
 */

const ICONS: Record<string, ReactNode> = {
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  s3: (
    <>
      <path d="M17.5 18a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.6 9.5 4 4 0 0 0 7 17.5" />
      <path d="M7 17.5h10.5" />
    </>
  ),
  editor: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  _default: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <polyline points="14 3 14 8 19 8" />
    </>
  ),
};

export function SourceTypeIcon({ type }: { type: string }) {
  return (
    <svg
      className="portal-sources__type-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[type] ?? ICONS._default}
    </svg>
  );
}
