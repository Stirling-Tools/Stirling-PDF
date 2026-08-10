import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { column, DataTable, type DataTableColumn } from "@app/ui";
import type { CatalogueEntry } from "@portal/api/policies";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";

interface PolicyCatalogueTableProps {
  entries: CatalogueEntry[];
  onOpen: (entry: CatalogueEntry) => void;
  /** Setup is unavailable (e.g. the AI engine is off): shown, but not openable. */
  isLocked?: (entry: CatalogueEntry) => boolean;
  /** Chip text explaining why setup is locked (e.g. "Requires AI engine"). */
  lockedLabel?: string;
}

/**
 * The policy catalogue as a data table (Policy / Enforces / Applies to / Docs /
 * Status). The status column resolves per row to a state badge, an info chip
 * (coming soon / requires AI), or a "Set up" call to action.
 */
export function PolicyCatalogueTable({
  entries,
  onOpen,
  isLocked,
  lockedLabel,
}: PolicyCatalogueTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<CatalogueEntry>[]>(
    () => [
      column.entity({
        key: "policy",
        header: t("portal.policies.table.policy", "Policy"),
        icon: (entry) => policyCategoryIcon(entry.category.id),
        primary: (entry) => t(entry.category.label),
      }),
      column.chips({
        key: "enforces",
        header: t("portal.policies.table.enforces", "Enforces"),
        get: (entry) =>
          entry.config.rules.map((r) => ({ label: t(r), accent: "neutral" })),
      }),
      column.muted({
        key: "scope",
        header: t("portal.policies.table.appliesTo", "Applies to"),
        get: (entry) => t(entry.config.scopeLabel),
      }),
      column.number({
        key: "docs",
        header: t("portal.policies.table.docs", "Docs enforced"),
        get: (entry) => (entry.policy ? entry.policy.stats.enforced : null),
        format: (n) => n.toLocaleString(),
      }),
      column.badge({
        key: "status",
        header: t("portal.policies.table.status", "Status"),
        // Every state reads as one badge; the "set up" affordance is the row
        // itself (click + chevron), so there's no bespoke button in the cell.
        get: (entry) => {
          if (entry.category.comingSoon) {
            return { tone: "neutral", label: t("portal.policies.card.comingSoon") };
          }
          if (isLocked?.(entry)) {
            return {
              tone: "neutral",
              label: lockedLabel ?? t("portal.policies.card.requiresAiEngine"),
            };
          }
          if (entry.policy) {
            const paused = entry.policy.state.status === "paused";
            return {
              tone: paused ? "warning" : "success",
              label: paused
                ? t("portal.policies.status.paused")
                : t("portal.policies.status.active"),
            };
          }
          return { tone: "neutral", label: t("portal.policySummary.action.setUp") };
        },
      }),
    ],
    [t, onOpen, isLocked, lockedLabel],
  );

  return (
    <DataTable<CatalogueEntry>
      columns={columns}
      rows={entries}
      rowKey={(e) => e.category.id}
      onRowClick={onOpen}
      isRowInteractive={(e) =>
        !(e.category.comingSoon || (isLocked?.(e) ?? false))
      }
      rowAffordance="chevron"
    />
  );
}
