import { useState } from "react";
import { useTranslation } from "react-i18next";
import PublicIcon from "@mui/icons-material/Public";
import ScheduleIcon from "@mui/icons-material/Schedule";
import HistoryIcon from "@mui/icons-material/History";
import DescriptionIcon from "@mui/icons-material/Description";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import LockIcon from "@mui/icons-material/Lock";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { PanelHeader } from "@shared/components/PanelHeader";
import { ROW_ACCENT } from "@app/components/policies/policyStatus";
import { Card } from "@shared/components/Card";
import { ChipFlow } from "@shared/components/ChipFlow";
import { StatusBadge } from "@shared/components/StatusBadge";
import { EmptyState } from "@shared/components/EmptyState";
import { Button } from "@shared/components/Button";
import { Banner } from "@shared/components/Banner";
import { ListRow } from "@shared/components/ListRow";
import type {
  PolicyActivityItem,
  PolicyCategory,
  PolicyConfigDef,
  PolicyRowStatus,
  PolicyStats,
} from "@app/types/policies";
import type { AutomationOperation } from "@app/types/automation";

interface PolicyDetailPanelProps {
  category: PolicyCategory;
  config: PolicyConfigDef;
  /** Derived display status. */
  status: PolicyRowStatus;
  /**
   * The policy's real configured steps (from its backing automation). When
   * present these drive the Enforces flow; otherwise the preset's decorative
   * `rules` are shown (e.g. before configuration).
   */
  steps?: AutomationOperation[];
  /** Activity feed derived from the user's files; empty until files exist. */
  activity?: PolicyActivityItem[];
  /** Summary stats derived from the user's files. */
  stats?: PolicyStats;
  canConfigure: boolean;
  /** Default (built-in) policies aren't deletable, so the Delete action hides. */
  canDelete: boolean;
  onBack: () => void;
  onEditSettings: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
  /** Re-run a failed activity item's policy on its file. */
  onRetry?: (item: PolicyActivityItem) => void;
}

/** "addWatermark" → "Add Watermark" — a light humanisation of op ids for display. */
function humanizeOperation(op: string): string {
  return op
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/**
 * A failed run's error in the activity feed. Backend errors can be long (or
 * multi-line stack traces) and would otherwise blow up the row, so anything
 * lengthy is clamped and collapsed by default with a Show more/less toggle.
 * Short messages (e.g. "Enforcement failed") render plainly with no toggle.
 */
function ActivityError({
  message,
  t,
}: {
  message: string;
  t: (key: string, defaultValue: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = message.length > 80 || message.includes("\n");
  if (!needsToggle) return <>{message}</>;
  return (
    <span className="pol-activity-error">
      <span
        className={`pol-activity-error__text${expanded ? "" : " pol-activity-error__text--clamped"}`}
      >
        {message}
      </span>
      <button
        type="button"
        className="pol-activity-error__toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? t("policies.detail.showLess", "Show less")
          : t("policies.detail.showMore", "Show more")}
      </button>
    </span>
  );
}

/** Narrative view for a configured policy (Enforces / Activity / Stats). */
export function PolicyDetailPanel({
  category,
  config,
  status,
  steps,
  activity,
  stats,
  canConfigure,
  canDelete,
  onBack,
  onEditSettings,
  onTogglePause,
  onDelete,
  onRetry,
}: PolicyDetailPanelProps) {
  const { t } = useTranslation();
  const isPaused = status === "paused";
  // Real configured steps drive the flow; fall back to the preset's rule labels.
  const enforceItems =
    steps && steps.length > 0
      ? steps.map((s) => humanizeOperation(s.operation))
      : config.rules;
  // Activity + stats are derived from the user's real files; until they load (or
  // if none exist) show an honest empty feed / zeroed stats.
  const activityItems = activity ?? [];
  const statValues = stats ?? {
    enforced: 0,
    dataProcessed: "0 B",
    activeFor: "—",
  };
  return (
    <div className="pol-detail">
      <PanelHeader
        icon={category.icon}
        accent={ROW_ACCENT[category.id]}
        title={t(`policies.catalog.${category.id}`, category.label)}
        onClose={onBack}
        closeLabel={t("policies.detail.close", "Close")}
        actions={
          <StatusBadge
            tone={isPaused ? "warning" : "success"}
            showDot
            pulse={!isPaused}
          >
            {isPaused
              ? t("policies.detail.statusPaused", "Paused")
              : t("policies.detail.statusActive", "Active")}
          </StatusBadge>
        }
      />

      <div className="pol-scroll">
        {/* Enforces */}
        <div>
          <p className="pol-section-label">
            {t("policies.detail.enforces", "Enforces")}
          </p>
          <Card padding="default">
            <div className="pol-rule-flow">
              <ChipFlow items={enforceItems} separator="arrow" />
            </div>
            <div className="pol-meta-row">
              <span className="pol-meta-item">
                <PublicIcon sx={{ fontSize: "0.8rem" }} />
                {config.scopeLabel}
              </span>
              <span className="pol-meta-item">
                <ScheduleIcon sx={{ fontSize: "0.8rem" }} />
                {t("policies.detail.onEveryUpload", "On every upload")}
              </span>
            </div>
            <div className="pol-note">
              <HistoryIcon sx={{ fontSize: "0.8rem" }} />
              {t(
                "policies.detail.originalsNote",
                "Originals stay untouched • Enforced version saved alongside",
              )}
            </div>
          </Card>
        </div>

        {/* Recent Activity */}
        <div>
          <p className="pol-section-label">
            {t("policies.detail.recentActivity", "Recent Activity")}
          </p>
          {activityItems.length > 0 ? (
            <Card padding="none">
              {activityItems.map((item, i) => (
                <ListRow
                  key={item.runId ?? `${item.doc}-${item.time}`}
                  divider={i > 0}
                  leadingTone={
                    item.status === "flagged"
                      ? "warning"
                      : item.status === "processing"
                        ? "info"
                        : "success"
                  }
                  leading={
                    item.status === "flagged" ? (
                      <WarningAmberIcon sx={{ fontSize: "0.85rem" }} />
                    ) : item.status === "processing" ? (
                      <AutorenewIcon
                        className="pol-spin"
                        sx={{ fontSize: "0.85rem" }}
                      />
                    ) : (
                      <CheckCircleIcon sx={{ fontSize: "0.85rem" }} />
                    )
                  }
                  title={item.doc}
                  description={
                    item.status === "flagged" ? (
                      <ActivityError message={item.action} t={t} />
                    ) : (
                      item.action
                    )
                  }
                  meta={item.time}
                  trailing={
                    item.status === "flagged" && onRetry ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRetry(item)}
                      >
                        {t("policies.detail.retry", "Retry")}
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </Card>
          ) : (
            <Card padding="default">
              <EmptyState
                size="compact"
                icon={<DescriptionIcon sx={{ fontSize: "1.5rem" }} />}
                title={t("policies.detail.noActivityTitle", "No activity yet")}
                description={t(
                  "policies.detail.noActivityDescription",
                  "Documents will appear here once this policy runs.",
                )}
              />
            </Card>
          )}
        </div>

        {/* Stats — one grouped card with divided columns, intentionally
            unlabelled for a quiet summary footer. */}
        <Card padding="none">
          <div className="pol-stats">
            <div className="pol-stat">
              <span className="pol-stat-value">
                {statValues.enforced.toLocaleString()}
              </span>
              <span className="pol-stat-label">
                {t("policies.detail.statDocsEnforced", "Docs enforced")}
              </span>
            </div>
            <div className="pol-stat">
              <span className="pol-stat-value">{statValues.dataProcessed}</span>
              <span className="pol-stat-label">
                {t("policies.detail.statDataProcessed", "Data processed")}
              </span>
            </div>
            <div className="pol-stat">
              <span className="pol-stat-value">{statValues.activeFor}</span>
              <span className="pol-stat-label">
                {t("policies.detail.statActive", "Active")}
              </span>
            </div>
          </div>
        </Card>

        {!canConfigure && (
          <Banner
            tone="neutral"
            icon={<LockIcon sx={{ fontSize: "1rem" }} />}
            description={t(
              "policies.detail.managedByOrg",
              "Managed by your organization. Contact a team leader to change this policy.",
            )}
          />
        )}
      </div>

      {canConfigure && (
        <div className={`pol-footer${canDelete ? "" : " pol-footer-end"}`}>
          {canDelete && (
            <Button
              variant="ghost"
              accent="red"
              size="sm"
              leadingIcon={<DeleteOutlineIcon sx={{ fontSize: "0.9rem" }} />}
              onClick={onDelete}
              style={{ marginRight: "auto" }}
            >
              {t("delete", "Delete")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onTogglePause}>
            {isPaused
              ? t("policies.detail.resume", "Resume")
              : t("policies.detail.pause", "Pause")}
          </Button>
          <Button variant="gradient" size="sm" onClick={onEditSettings}>
            {t("policies.detail.editSettings", "Edit Settings")}
          </Button>
        </div>
      )}
    </div>
  );
}
