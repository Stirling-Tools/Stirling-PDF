import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Card,
  Chip,
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
import { policyIcon } from "@portal/components/policies/policyIcons";
import "@portal/views/Policies.css";

interface PolicyDetailPanelProps {
  /** The configured policy being viewed, or null when closed. */
  policy: DecoratedPolicy | null;
  /** Whether a lifecycle action (run/pause/delete) is in flight. */
  busy?: boolean;
  onClose: () => void;
  onEdit: () => void;
  /** When absent the Run now button is hidden — use until the backend supports a trigger endpoint. */
  onRun?: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
  /** Re-run a failed activity item. Optional — retry button is hidden when absent. */
  onRetry?: (item: PolicyActivityItem) => void;
}

/** SVG icons for activity row status — avoids MUI dep in the portal bundle. */
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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

/**
 * Long error messages (stack traces, verbose backend errors) are clamped by
 * default and revealed with a Show more/less toggle.
 */
function ActivityError({
  message,
}: {
  message: string;
}) {
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

/**
 * Narrative view for a configured policy: the enforced tool chain, recent
 * activity, summary stats, and the lifecycle actions (run now, pause/resume,
 * delete). Built-in (default) policies hide Delete — they're configurable but
 * not deletable, matching the backend.
 */
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
  const enforceItems = steps.length > 0 ? steps.map((s) => s.operation) : [];
  const trigger = state.runOn === "export"
    ? t("policies.detail.onEveryExport")
    : t("policies.detail.onEveryUpload");

  return (
    <Modal
      open
      onClose={onClose}
      width="lg"
      title={
        <span className="portal-policies__wizard-title">
          <span
            className={`portal-policies__cat-icon portal-policies__cat-icon--${category.tone}`}
            aria-hidden
          >
            {policyIcon(category.icon)}
          </span>
          {t("policies.detail.title", { category: category.label })}
        </span>
      }
      subtitle={config.summary}
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
      <div className="portal-policies__detail-status">
        <StatusBadge tone={isPaused ? "warning" : "success"} pulse={!isPaused}>
          {isPaused ? t("policies.status.paused") : t("policies.status.active")}
        </StatusBadge>
        <span className="portal-policies__detail-meta">
          {t("policies.detail.meta", {
            event: state.runOn ?? "upload",
            output:
              state.outputMode === "new_file"
                ? t("policies.detail.outputAsNewFile")
                : t("policies.detail.outputAsNewVersion"),
          })}
        </span>
      </div>

      <h3 className="portal-policies__wizard-heading">
        {t("policies.detail.enforces")}
      </h3>
      <Card padding="default">
        {enforceItems.length > 0 ? (
          <div className="portal-policies__enforce-flow">
            {enforceItems.map((op, i) => (
              <span key={op} className="portal-policies__enforce-item">
                {i > 0 && (
                  <span className="portal-policies__enforce-arrow" aria-hidden>
                    →
                  </span>
                )}
                <Chip tone="blue" size="sm">
                  {humanizeEndpoint(op)}
                </Chip>
              </span>
            ))}
          </div>
        ) : (
          <div className="portal-policies__enforce-flow">
            {config.rules.map((rule) => (
              <Chip key={rule} tone="neutral" size="sm">
                {rule}
              </Chip>
            ))}
          </div>
        )}
        <div className="portal-policies__enforce-meta">
          <span className="portal-policies__enforce-meta-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            {config.scopeLabel}
          </span>
          <span className="portal-policies__enforce-meta-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
            </svg>
            {trigger}
          </span>
        </div>
        <p className="portal-policies__enforce-note">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.05 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
          </svg>
          {t("policies.detail.originalsNote")}
        </p>
      </Card>

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

      {state.scopeTypes.length > 0 && (
        <Banner
          tone="neutral"
          title={t("policies.detail.scoped.title")}
          description={t("policies.detail.scoped.description", {
            types: state.scopeTypes.join(", "),
          })}
        />
      )}
    </Modal>
  );
}
