/**
 * Stroke-SVG icons for source types, replacing the black Unicode glyphs
 * (⛁ ☁ ✏ ◇) that rendered off-style and mis-centred inside the type tiles and
 * table badges. Keyed by the backend source `type`; unknown types fall back to
 * a neutral document mark.
 */

const PATHS: Record<string, string> = {
  folder: "M3 7h6l2 2h10v9a1 1 0 01-1 1H4a1 1 0 01-1-1V7z",
  s3: "M7 18a4 4 0 010-8 5 5 0 019.6-1.3A3.5 3.5 0 0117 18H7z",
  editor: "M4 20h16M14 4l6 6-9 9H5v-6l9-9z",
  _default:
    "M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4zM14 3v4h4",
};

export function SourceTypeIcon({ type }: { type: string }) {
  const d = PATHS[type] ?? PATHS._default;
  return (
    <svg
      className="portal-sources__type-svg"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
