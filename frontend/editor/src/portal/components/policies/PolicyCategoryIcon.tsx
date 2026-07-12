import type { PolicyCategory } from "@portal/api/policies";
import "@portal/components/policies/PolicyCategoryIcon.css";

/**
 * Stroke-SVG icons for the policy catalogue, keyed by the category's string icon
 * key. Replaces the old Unicode glyph map (▤ 🛡 ✓ …) so category rows use the
 * same line-icon system as the rest of the portal instead of box-drawing
 * characters. Unknown keys fall back to a neutral document mark (never a bare
 * bullet — that was the "schedule"/"clock" key mismatch's tell).
 */

const PATHS: Record<string, string> = {
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  shield: "M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z",
  check: "M20 7L10 17l-5-5",
  route:
    "M6 4a2 2 0 100 4 2 2 0 000-4zM18 16a2 2 0 100 4 2 2 0 000-4zM6 8v6a4 4 0 004 4h4",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  schedule: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  file: "M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4zM14 3v4h4",
  device:
    "M5 4h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM9 20h6",
  globe:
    "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18",
  cloud: "M7 18a4 4 0 010-8 5 5 0 019.6-1.3A3.5 3.5 0 0117 18H7z",
  mail: "M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM4 7l8 6 8-6",
  folder: "M3 7h6l2 2h10v9a1 1 0 01-1 1H4a1 1 0 01-1-1V7z",
};

const TONE_CLASS: Record<PolicyCategory["tone"], string> = {
  blue: "pcat-badge--blue",
  purple: "pcat-badge--purple",
  green: "pcat-badge--green",
  amber: "pcat-badge--amber",
  red: "pcat-badge--red",
  neutral: "pcat-badge--neutral",
};

/** A tinted rounded badge holding the category's stroke icon. */
export function PolicyCategoryBadge({
  category,
}: {
  category: PolicyCategory;
}) {
  const d = PATHS[category.icon] ?? PATHS.file;
  return (
    <span
      className={`pcat-badge ${TONE_CLASS[category.tone] ?? TONE_CLASS.neutral}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d={d}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
