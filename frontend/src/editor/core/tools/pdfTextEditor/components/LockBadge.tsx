import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import type { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";
import "@editor/tools/pdfTextEditor/components/LockBadge.css";

interface LockBadgeProps {
  rect: PageRect;
  pageHeight: number;
  transform: DisplayTransform;
  scale: number;
  onUnlock: () => void;
  testId: string;
  /** Layered under the page's text and tables, letting presses reach the stage
   *  (a marquee can start over a locked background image). */
  underContent?: boolean;
}

/**
 * The way back into a locked text box or image. A locked item ignores clicks,
 * so it can never be selected to reach an Unlock control; this covers its box
 * and, on hover or keyboard focus, shows a badge on the corner that unlocks it.
 */
export function LockBadge({
  rect,
  pageHeight,
  transform,
  scale,
  onUnlock,
  testId,
  underContent = false,
}: LockBadgeProps) {
  const { t } = useTranslation();
  // Through all four corners, so a rotated page still covers the box the user sees.
  const corners = [
    transform.apply(rect.x, rect.y),
    transform.apply(rect.x + rect.width, rect.y),
    transform.apply(rect.x, rect.y + rect.height),
    transform.apply(rect.x + rect.width, rect.y + rect.height),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const label = t("pdfTextEditor.lock.unlockTip", "Locked. Click to unlock");

  return (
    <div
      className={
        underContent
          ? "pdf-editor-lock-zone pdf-editor-lock-zone--under"
          : "pdf-editor-lock-zone"
      }
      style={{
        left: minX * scale,
        top: (pageHeight - maxY) * scale,
        width: (maxX - minX) * scale,
        height: (maxY - minY) * scale,
      }}
      // A press on a locked item stays inert, as it is on the item itself.
      onPointerDown={underContent ? undefined : (e) => e.stopPropagation()}
    >
      <Tooltip label={label} position="top" withArrow>
        <button
          type="button"
          className="pdf-editor-lock-badge"
          aria-label={label}
          data-testid={testId}
          onClick={(e) => {
            e.stopPropagation();
            onUnlock();
          }}
        >
          <Icon
            name="lock"
            size={12}
            className="pdf-editor-lock-badge__locked"
          />
          <Icon
            name="lock-open"
            size={12}
            className="pdf-editor-lock-badge__open"
          />
        </button>
      </Tooltip>
    </div>
  );
}
