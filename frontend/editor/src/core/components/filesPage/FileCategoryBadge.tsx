import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import SellIcon from "@mui/icons-material/Sell";

/**
 * Category tag for a classified file: the first label with a tag glyph, a
 * "+n" for the rest, and every label on hover. Renders nothing for an
 * unclassified file — absence of the tag IS the "no category" state, so the
 * grid never fills with empty chrome.
 */
export function FileCategoryBadge({ labels }: { labels?: string[] | null }) {
  const { t } = useTranslation();
  if (!labels || labels.length === 0) return null;
  return (
    <Tooltip
      label={t("filesPage.categoryHint", {
        labels: labels.join(", "),
        defaultValue: "Categories: {{labels}}",
      })}
      withinPortal
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.1rem 0.4rem",
          borderRadius: "999px",
          fontSize: "0.68rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          lineHeight: 1.2,
          maxWidth: "9rem",
          background:
            "color-mix(in srgb, var(--mantine-color-grape-6) 16%, transparent)",
          color: "var(--c-text-muted)",
        }}
      >
        <SellIcon style={{ fontSize: "0.85rem", flexShrink: 0 }} />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {labels[0]}
        </span>
        {labels.length > 1 && <span>+{labels.length - 1}</span>}
      </span>
    </Tooltip>
  );
}
