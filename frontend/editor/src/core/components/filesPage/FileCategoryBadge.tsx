import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import {
  useFamilyBadges,
  useLabelBadges,
} from "@app/components/shared/fileSidebarGrouping";

/** At most this many icons on a card; the hover names everything. */
const MAX_ICONS = 3;

/**
 * A classified file's categories, worn as the classification vocabulary's own
 * icons in the sidebar's own category accents — no text, names on hover.
 * Category (family) icons lead, the labels follow, so the badge names the
 * sidebar group first and the specifics after. Renders nothing for an
 * unclassified file (or in builds without classification): absence of the
 * badge IS the "no category" state.
 */
export function FileCategoryBadge({ labels }: { labels?: string[] | null }) {
  const { t } = useTranslation();
  const families = useFamilyBadges(labels);
  const labelBadges = useLabelBadges(labels);
  const badges = [...families, ...labelBadges];
  if (badges.length === 0) return null;
  const hover =
    families.length > 0
      ? t("filesPage.categoryHintGrouped", {
          families: families.map((badge) => badge.name).join(", "),
          labels: labelBadges.map((badge) => badge.name).join(", "),
          defaultValue: "{{families}} — {{labels}}",
        })
      : t("filesPage.categoryHint", {
          labels: labelBadges.map((badge) => badge.name).join(", "),
          defaultValue: "Categories: {{labels}}",
        });
  return (
    <Tooltip label={hover} withinPortal>
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
