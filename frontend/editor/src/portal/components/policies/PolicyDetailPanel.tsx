import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  Modal,
  StatTile,
  StatusBadge,
} from "@shared/components";
import {
  humanizeEndpoint,
  type DecoratedPolicy,
  type PolicyActivityItem,
} from "@portal/api/policies";
import "@portal/views/Policies.css";

interface PolicyDetailPanelProps {
  policy: DecoratedPolicy | null;
  busy?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRun?: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
  onRetry?: (item: PolicyActivityItem) => void;
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="portal-policies__activity-spin"
      aria-hidden
    >
      <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z" />
    </svg>
  );
}

function ActivityError({ message }: { message: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const needsToggle = message.length > 80 || message.includes("\n");
  if (!needsToggle) return <>{message}</>;
  return (
    <span className="portal-policies__activity-error">
      <span
        className={
          "portal-policies__activity-error-text" +
          (expanded ? "" : " portal-policies__activity-error-text--clamped")
        }
      >
        {message}
      </span>
      <button
        type="button"
        className="portal-policies__link portal-policies__activity-error-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? t("policies.detail.showLess")
          : t("policies.detail.showMore")}
      </button>
    </span>
  );
}

export function PolicyDetailPanel({
  policy,
  busy = false,
  onClose,
  onEdit,
  onRun,
  onTogglePause,
  onDelete,
  onRetry,
}: PolicyDetailPanelProps) {
  const { t } = useTranslation();
  if (!policy) return null;
  const { category, config, state, steps, stats, activity } = policy;
  const isPaused = state.status === "paused";
  const canDelete = state.isDefault !== true;

  const enforceItems = steps.length > 0 ? steps.map((s) => s.operation) : null;
  const hasEditorSource = state.sources.includes("editor");
  const trigger =
    state.runOn === "export"
      ? t("policies.detail.onEveryExport")
      : t("policies.detail.onEveryUpload");
  const outputLabel =
    state.outputMode === "new_file"
      ? t("policies.detail.outputAsNewFile")
      : t("policies.detail.outputAsNewVersion");

  function sourceLabel(id: string) {
    if (id === "editor") return t("sources.types.editor.label");
    return id;
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={category.label}
      footer={
        <div className="portal-policies__detail-foot">
          {canDelete && (
            <Button
              variant="ghost"
              accent="red"
              size="sm"
              onClick={onDelete}
              disabled={busy}
              style={{ marginRight: "auto" }}
            >
              {t("policies.detail.actions.delete")}
            </Button>
          )}
          {onRun && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRun}
              disabled={busy}
              style={canDelete ? undefined : { marginRight: "auto" }}
            >
              {t("policies.detail.actions.runNow")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onTogglePause}
            disabled={busy}
          >
            {isPaused
              ? t("policies.detail.actions.resume")
              : t("policies.detail.actions.pause")}
          </Button>
          <Button size="sm" onClick={onEdit} disabled={busy}>
            {t("policies.detail.actions.editSettings")}
          </Button>
        </div>
      }
    >
      {/* Status + trigger strip */}
      <div className="portal-policies__detail-status">
        <StatusBadge tone={isPaused ? "warning" : "success"} pulse={!isPaused}>
          {isPaused ? t("policies.status.paused") : t("policies.status.active")}
        </StatusBadge>
        {hasEditorSource && (
          <>
            <span className="portal-policies__detail-sep" aria-hidden>
              ·
            </span>
            <span className="portal-policies__detail-meta">{trigger}</span>
            <span className="portal-policies__detail-sep" aria-hidden>
              ·
            </span>
            <span className="portal-policies__detail-meta">{outputLabel}</span>
          </>
        )}
      </div>

      {/* Enforces — plain text, no pills */}
      <div className="portal-policies__detail-inline">
        <span className="portal-policies__detail-inline-label">
          {t("policies.detail.enforces")}
        </span>
        <span className="portal-policies__detail-inline-value">
          {enforceItems
            ? enforceItems.map((op, i) => (
                <span key={op}>
                  {i > 0 && (
                    <span
                      className="portal-policies__enforce-arrow"
                      aria-hidden
                    >
                      {" "}
                      →{" "}
                    </span>
                  )}
                  {humanizeEndpoint(op)}
                </span>
              ))
            : config.rules.join(" · ")}
        </span>
      </div>

      {/* Sources */}
      {state.sources.length > 0 && (
        <div className="portal-policies__detail-inline">
          <span className="portal-policies__detail-inline-label">
            {t("policies.detail.sources")}
          </span>
          <span className="portal-policies__detail-inline-value">
            {state.sources.map(sourceLabel).join(" · ")}
          </span>
        </div>
      )}

      <h3 className="portal-policies__wizard-heading">
        {t("policies.detail.recentActivity")}
      </h3>

      {activity.length > 0 ? (
        <Card padding="none">
          {activity.map((item, i) => (
            <div
              key={`${item.doc}-${i}`}
              className="portal-policies__activity-row"
            >
              <span
                className={`portal-policies__activity-icon portal-policies__activity-icon--${
                  item.status === "flagged"
                    ? "warning"
                    : item.status === "processing"
                      ? "info"
                      : "success"
                }`}
              >
                {item.status === "flagged" ? (
                  <WarnIcon />
                ) : item.status === "processing" ? (
                  <SpinIcon />
                ) : (
                  <CheckIcon />
                )}
              </span>
              <span className="portal-policies__activity-text">
                <span className="portal-policies__activity-doc">
                  {item.doc}
                </span>
                <span className="portal-policies__activity-action">
                  {item.status === "flagged" ? (
                    <ActivityError message={item.action} />
                  ) : (
                    item.action
                  )}
                </span>
              </span>
              <span className="portal-policies__activity-time">
                {item.time}
              </span>
              {item.status === "flagged" && onRetry && (
                <button
                  type="button"
                  className="portal-policies__link portal-policies__activity-retry"
                  onClick={() => onRetry(item)}
                >
                  {t("policies.detail.retry")}
                </button>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <Card padding="default">
          <EmptyState
            size="compact"
            title={t("policies.detail.emptyActivity.title")}
            description={t("policies.detail.emptyActivity.description")}
          />
        </Card>
      )}

      <Card padding="none" className="portal-policies__detail-stats">
        <StatTile
          label={t("policies.stats.docsEnforced")}
          value={stats.enforced.toLocaleString()}
        />
        <StatTile
          label={t("policies.stats.dataProcessed")}
          value={stats.dataProcessed}
        />
        <StatTile
          label={t("policies.stats.activeFor")}
          value={stats.activeFor}
        />
      </Card>
    </Modal>
  );
}
