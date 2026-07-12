import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Chip,
  type ChipAccent,
  StatusBadge,
  Table,
  type TableColumn,
} from "@app/ui";
import type { CatalogueEntry, PolicyCategory } from "@portal/api/policies";
import { PolicyCategoryBadge } from "@portal/components/policies/PolicyCategoryIcon";
import "@portal/views/Policies.css";

interface PolicyCatalogueTableProps {
  entries: CatalogueEntry[];
  onOpen: (entry: CatalogueEntry) => void;
}

/** Tint the "enforces" chips with the same hue as the category's icon badge. */
const TONE_ACCENT: Record<PolicyCategory["tone"], ChipAccent> = {
  blue: "default",
  purple: "premium",
  green: "success",
  amber: "warning",
  red: "danger",
  neutral: "neutral",
};

/**
 * The policy catalogue as a proper data table (Policy / Enforces / Applies to /
 * Docs / Status), replacing the stacked full-width cards that read as "blocky".
 * Same shared Table + StatusBadge + Chip primitives the Sources, Documents and
 * Home policy tables use, so every list page in the portal now reads alike.
 */
export function PolicyCatalogueTable({
  entries,
  onOpen,
}: PolicyCatalogueTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<TableColumn<CatalogueEntry>[]>(
    () => [
      {
        key: "policy",
        header: t("portal.policies.table.policy", "Policy"),
        render: (entry) => (
          <div className="portal-policies__cell">
            <PolicyCategoryBadge category={entry.category} />
            <strong className="portal-policies__cell-name">
              {t(entry.category.label)}
            </strong>
          </div>
        ),
      },
      {
        key: "enforces",
        header: t("portal.policies.table.enforces", "Enforces"),
        render: (entry) => (
          <div className="portal-policies__rulechips">
            {entry.config.rules.map((r) => (
              <Chip key={r} accent={TONE_ACCENT[entry.category.tone]} size="sm">
                {t(r)}
              </Chip>
            ))}
          </div>
        ),
      },
      {
        key: "scope",
        header: t("portal.policies.table.appliesTo", "Applies to"),
        render: (entry) => (
          <span className="portal-policies__muted">
            {t(entry.config.scopeLabel)}
          </span>
        ),
      },
      {
        key: "docs",
        header: t("portal.policies.table.docs", "Docs enforced"),
        align: "right",
        width: "8rem",
        render: (entry) => (
          <span className="portal-policies__docs">
            {entry.policy ? entry.policy.stats.enforced.toLocaleString() : "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: t("portal.policies.table.status", "Status"),
        align: "right",
        width: "8.5rem",
        render: (entry) => {
          if (entry.category.comingSoon) {
            // One consistent neutral chip for every "Upgrade to Enterprise" —
            // the same action should read the same on every row.
            return (
              <Chip accent="neutral" size="sm">
                {t("portal.policies.card.comingSoon")}
              </Chip>
            );
          }
          if (entry.policy) {
            const paused = entry.policy.state.status === "paused";
            return (
              <StatusBadge
                tone={paused ? "warning" : "success"}
                size="sm"
                pulse={!paused}
              >
                {paused
                  ? t("portal.policies.status.paused")
                  : t("portal.policies.status.active")}
              </StatusBadge>
            );
          }
          return (
            <Button size="sm" variant="secondary" onClick={() => onOpen(entry)}>
              {t("portal.policySummary.action.setUp")}
            </Button>
          );
        },
      },
    ],
    [t, onOpen],
  );

  return (
    <Table<CatalogueEntry>
      className="portal-policies__table"
      columns={columns}
      rows={entries}
      rowKey={(e) => e.category.id}
      onRowClick={(entry) =>
        entry.category.comingSoon ? undefined : onOpen(entry)
      }
    />
  );
}
