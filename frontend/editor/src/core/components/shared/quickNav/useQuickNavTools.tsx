import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useSigningBadgeCount } from "@app/hooks/signing/useSigningBadgeCount";
import LocalIcon from "@app/components/shared/LocalIcon";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";
import type { ToolId } from "@app/types/toolId";

const ICON_SIZE = "1.125rem";

// PLACEHOLDER, shown only while the real count is zero, so the badge design can
// be judged on a quiet account. Delete it and pass signingCount alone.
const PLACEHOLDER_SIGNING_COUNT = 2;

/**
 * The quick action shortcuts pinned to the rail.
 *
 * Icons are written as literals rather than looked up from a map: the icon
 * bundler (scripts/generate-icons.js) finds icons by scanning source for
 * `icon="…"`, so a dynamic lookup would silently drop them from the offline
 * bundle and fall back to the CDN - broken in an air-gapped deployment.
 *
 * A tool that this deployment has disabled is rendered disabled with the reason
 * rather than dropped, because `toolAvailability` is empty while endpoint status
 * loads: dropping on that signal made icons vanish a beat after first paint,
 * shifting everything below them.
 */
export function useQuickNavTools(): QuickNavEntry[] {
  const { t } = useTranslation();
  const { handleToolSelect, resetTool, selectedToolKey, toolAvailability } =
    useToolWorkflow();
  // Sign requests awaiting this user, plus their own sessions that gained
  // signatures since they last looked. 0 when group signing is off.
  const signingCount = useSigningBadgeCount();

  const shortcut = (
    id: ToolId,
    label: string,
    icon: React.ReactNode,
  ): QuickNavEntry => {
    const availability = toolAvailability[id];
    const unavailable = availability?.available === false;
    return {
      id,
      label,
      icon,
      kind: "action",
      disabled: unavailable,
      reason: unavailable
        ? t("quickNav.toolUnavailable", "Not available in this deployment")
        : undefined,
      isActive: selectedToolKey === id,
      // Re-picking the tool you're in resets it, so the icon doubles as
      // "start over" rather than doing nothing.
      onClick: () =>
        selectedToolKey === id ? resetTool(id) : handleToolSelect(id),
    };
  };

  return [
    shortcut(
      "automate" as ToolId,
      t("quickAccess.automate", "Automate"),
      <LocalIcon
        icon="rebase-outline-rounded"
        width={ICON_SIZE}
        height={ICON_SIZE}
      />,
    ),
    // sharedSign (signature requests and sessions), NOT sign (draw or type your
    // own signature). Shared Signing is the one entry here with a real,
    // already-polled count, which is what makes it worth a permanent slot.
    {
      ...shortcut(
        "sharedSign" as ToolId,
        t("home.sharedSign.title", "Shared Signing"),
        <LocalIcon
          icon="draw-outline-rounded"
          width={ICON_SIZE}
          height={ICON_SIZE}
        />,
      ),
      badge: signingCount || PLACEHOLDER_SIGNING_COUNT,
      // Awareness, not action: a signing request is someone else's deadline.
      badgeTone: "warning" as const,
    },
  ];
}
