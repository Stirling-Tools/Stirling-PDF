// Shared source of truth for a policy category's outline icon, keyed by category
// id (not a parallel icon-name vocabulary). Used by the editor's policy
// definitions and the portal's catalogue cards, summaries, and setup wizard.

import type { ReactNode } from "react";
import { Icon, type IconName } from "@app/ui/Icon";

/** Policy category id → outline glyph. */
const POLICY_CATEGORY_ICONS: Record<string, IconName> = {
  ingestion: "layers",
  security: "shield",
  classification: "tag",
  compliance: "circle-check",
  routing: "git-fork",
  retention: "clock",
};

const FALLBACK_ICON: IconName = "tag";

// Defaults to inheriting the surrounding font-size so a wrapping box controls size.
export function policyCategoryIcon(
  policyKey: string,
  size: number | string = "1em",
  className?: string,
): ReactNode {
  return (
    <Icon
      name={POLICY_CATEGORY_ICONS[policyKey] ?? FALLBACK_ICON}
      size={size}
      className={className}
    />
  );
}
