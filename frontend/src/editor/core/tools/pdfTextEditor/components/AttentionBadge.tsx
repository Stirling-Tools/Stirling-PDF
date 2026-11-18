import type { CSSProperties } from "react";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import type { ImageAttention } from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/**
 * The warning mark on content the accessibility review flags. `style` places
 * it; the caller's box must be positioned.
 */
export function AttentionBadge({
  attention,
  testId,
  style,
}: {
  attention: ImageAttention;
  testId: string;
  style: CSSProperties;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip
      label={
        attention === "needs-description"
          ? t(
              "pdfTextEditor.inspector.accessibility.needsDescriptionBadge",
              "No description",
            )
          : t(
              "pdfTextEditor.inspector.accessibility.untaggedBadge",
              "Not tagged",
            )
      }
    >
      <span
        data-testid={testId}
        data-attention={attention}
        style={{
          position: "absolute",
          display: "flex",
          padding: 2,
          borderRadius: "50%",
          background: "var(--c-surface)",
          color: "var(--c-warning)",
          boxShadow: "0 0 0 1px var(--c-border)",
          // The text overlay passes pointer events through; the tooltip needs hover.
          pointerEvents: "auto",
          ...style,
        }}
      >
        <Icon name="circle-alert" size={14} />
      </span>
    </Tooltip>
  );
}
