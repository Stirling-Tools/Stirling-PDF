import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { useLabelBadges } from "@app/components/shared/fileSidebarGrouping";

/** At most this many label icons on a card; the hover names every label. */
const MAX_ICONS = 3;

/**
 * A classified file's categories, worn as the classification vocabulary's own
 * icons in the sidebar's own category accents — no text, names on hover.
 * Renders nothing for an unclassified file (or in builds without
 * classification): absence of the badge IS the "no category" state.
 */
export function FileCategoryBadge({ labels }: { labels?: string[] | null }) {
  const { t } = useTranslation();
  const badges = useLabelBadges(labels);
  if (badges.length === 0) return null;
  return (
    <Tooltip
      label={t("filesPage.categoryHint", {
        labels: badges.map((badge) => badge.name).join(", "),
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
          lineHeight: 1.2,
          background:
            "color-mix(in srgb, var(--c-text-subtle) 16%, transparent)",
        }}
      >
        {badges.slice(0, MAX_ICONS).map((badge) => (
          <LocalIcon
            key={badge.id}
            icon={badge.icon}
            width="0.85rem"
            style={badge.color ? { color: badge.color } : undefined}
          />
        ))}
        {badges.length > MAX_ICONS && (
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 600,
              color: "var(--c-text-muted)",
            }}
          >
            +{badges.length - MAX_ICONS}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
