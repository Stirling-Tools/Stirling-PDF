import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, StatusBadge, Table, type TableColumn } from "@app/ui";
import type { CatalogueEntry } from "@processor/api/policies";
import { PolicyCategoryBadge } from "@processor/components/policies/PolicyCategoryIcon";
import "@processor/views/Policies.css";

interface PolicyCatalogueTableProps {
  entries: CatalogueEntry[];
  onOpen: (entry: CatalogueEntry) => void;
  /** Setup is unavailable (e.g. the AI engine is off): shown, but not openable. */
  isLocked?: (entry: CatalogueEntry) => boolean;
  /** Chip text explaining why setup is locked (e.g. "Requires AI engine"). */
  lockedLabel?: string;
}

/**
 * The policy catalogue as a proper data table (Policy / Enforces / Applies to /
 * Docs / Status), replacing the stacked full-width cards that read as "blocky".
 * Same shared Table + StatusBadge + Chip primitives the Sources, Documents and
 * Home policy tables use, so every list page in the processor now reads alike.
 */
export function PolicyCatalogueTable({
  entries,
  onOpen,
  isLocked,
  lockedLabel,
}: PolicyCatalogueTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<TableColumn<CatalogueEntry>[]>(
    () => [
      {
        key: "policy",
        header: t("processor.policies.table.policy", "Policy"),
        render: (entry) => (
          <div className="processor-policies__cell">
            <PolicyCategoryBadge category={entry.category} />
            <strong className="processor-policies__cell-name">
              {t(entry.category.label)}
            </strong>
          </div>
        ),
      },
      {
        key: "enforces",
        header: t("processor.policies.table.enforces", "Enforces"),
        render: (entry) => (
          <div className="processor-policies__rulechips">
            {entry.config.rules.map((r) => (
              <Chip key={r} accent="neutral" size="sm">
                {t(r)}
              </Chip>
            ))}
          </div>
        ),
      },
      {
        key: "scope",
        header: t("processor.policies.table.appliesTo", "Applies to"),
        render: (entry) => (
          <span className="processor-policies__muted">
            {t(entry.config.scopeLabel)}
          </span>
        ),
      },
      {
        key: "docs",
        header: t("processor.policies.table.docs", "Docs enforced"),
        align: "right",
        width: "8rem",
        render: (entry) => (
          <span className="processor-policies__docs">
            {entry.policy ? entry.policy.stats.enforced.toLocaleString() : "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: t("processor.policies.table.status", "Status"),
        align: "right",
        width: "8.5rem",
        render: (entry) => {
          if (entry.category.comingSoon) {
            // One consistent neutral chip for every "Upgrade to Enterprise" —
            // the same action should read the same on every row.
            return (
              <Chip accent="neutral" size="sm">
                {t("processor.policies.card.comingSoon")}
              </Chip>
            );
          }
          if (isLocked?.(entry)) {
            return (
              <Chip accent="neutral" size="sm">
                {lockedLabel ?? t("processor.policies.card.requiresAiEngine")}
              </Chip>
            );
          }
          if (entry.policy) {
            const paused = entry.policy.state.status === "paused";
            return (
              <StatusBadge tone={paused ? "warning" : "success"} size="sm">
                {paused
                  ? t("processor.policies.status.paused")
                  : t("processor.policies.status.active")}
              </StatusBadge>
            );
          }
          return (
            <Button size="sm" variant="secondary" onClick={() => onOpen(entry)}>
              {t("processor.policySummary.action.setUp")}
            </Button>
          );
        },
      },
    ],
    [t, onOpen, isLocked, lockedLabel],
  );

  return (
    <Table<CatalogueEntry>
      className="processor-policies__table"
      columns={columns}
      rows={entries}
      rowKey={(e) => e.category.id}
      onRowClick={(entry) =>
        entry.category.comingSoon || isLocked?.(entry)
          ? undefined
          : onOpen(entry)
      }
      // A category with no policy yet renders a "set up" button, which opens the same thing.
      rowsContainControls
    />
  );
}
