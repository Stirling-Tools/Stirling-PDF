import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  Modal,
  StatTile,
  StatusBadge,
} from "@app/ui";
import {
  humanizeEndpoint,
  type DecoratedPolicy,
  type PolicyActivityItem,
} from "@portal/api/policies";
import "@portal/views/Policies.css";

interface PolicyDetailPanelProps {
  policy: DecoratedPolicy | null;
  busy?: boolean;
  /** Whether the user may manage required policies; a required policy is read-only when false. */
  canManagePolicies?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRun?: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
  onClearHistory?: () => void;
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
      <Button
        type="button"
        variant="quiet"
        className="portal-policies__link portal-policies__activity-error-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? t("portal.policies.detail.showLess")
          : t("portal.policies.detail.showMore")}
      </Button>
    </span>
  );
}

export function PolicyDetailPanel({
  policy,
  busy = false,
  canManagePolicies = true,
  onClose,
  onEdit,
  onRun,
  onTogglePause,
  onDelete,
  onClearHistory,
  onRetry,
}: PolicyDetailPanelProps) {
  const { t } = useTranslation();
  const [confirmingClear, setConfirmingClear] = useState(false);
  if (!policy) return null;
  const { category, config, state, steps, stats, activity } = policy;
  const isPaused = state.status === "paused";
  // An org-mandated (required) policy may only be modified by a manager; others see it read-only.
  const readOnly = state.required && !canManagePolicies;
  const canDelete = state.isDefault !== true && !readOnly;
  // Editor participation is its own flag (runsOnEditor), not a source. A legacy policy still carries
  // "editor" in its stored sources until re-saved, so drop it here to count only real watched sources.
  const realSources = state.sources.filter((s) => s !== "editor");
  // Processed history only exists for watched sources; editor uploads are never ledgered.
  const canClearHistory =
    onClearHistory !== undefined && realSources.length > 0 && !readOnly;

  const enforceItems = steps.length > 0 ? steps.map((s) => s.operation) : null;
  const hasEditorSource = state.runsOnEditor === true;
  const trigger =
    state.runOn === "export"
      ? t("portal.policies.detail.onEveryExport")
      : t("portal.policies.detail.onEveryUpload");
  const outputLabel =
    state.outputMode === "new_file"
      ? t("portal.policies.detail.outputAsNewFile")
      : t("portal.policies.detail.outputAsNewVersion");

  return (
    <>
      <Modal
        open
        onClose={onClose}
        width="lg"
        title={t(category.label)}
        footer={
          <div className="portal-policies__detail-foot">
            {readOnly && (
              <span className="portal-policies__detail-readonly">
                {t("portal.policies.detail.managerOnly")}
              </span>
            )}
            {canDelete && (
              <Button
                variant="tertiary"
                accent="danger"
                size="sm"
                onClick={onDelete}
                disabled={busy}
                style={{ marginRight: "auto" }}
              >
                {t("portal.policies.detail.actions.delete")}
              </Button>
            )}
            {onRun && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRun}
                disabled={busy}
                style={canDelete ? undefined : { marginRight: "auto" }}
              >
                {t("portal.policies.detail.actions.runNow")}
              </Button>
            )}
            {canClearHistory && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmingClear(true)}
                disabled={busy}
              >
                {t("portal.policies.detail.actions.clearHistory")}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onTogglePause}
              disabled={busy || readOnly}
            >
              {isPaused
                ? t("portal.policies.detail.actions.resume")
                : t("portal.policies.detail.actions.pause")}
            </Button>
            <Button size="sm" onClick={onEdit} disabled={busy || readOnly}>
              {t("portal.policies.detail.actions.editSettings")}
            </Button>
          </div>
        }
      >
        {/* Status + trigger strip */}
        <div className="portal-policies__detail-status">
          <StatusBadge tone={isPaused ? "warning" : "success"}>
            {isPaused
              ? t("portal.policies.status.paused")
              : t("portal.policies.status.active")}
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
              <span className="portal-policies__detail-meta">
                {outputLabel}
              </span>
            </>
          )}
        </div>

        {/* Enforces — plain text, no pills */}
        <div className="portal-policies__detail-inline">
          <span className="portal-policies__detail-inline-label">
            {t("portal.policies.detail.enforces")}
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
                    {humanizeEndpoint(op, t)}
                  </span>
                ))
              : config.rules.map((r) => t(r)).join(" · ")}
          </span>
        </div>

        {/* Sources */}
        {realSources.length > 0 && (
          <div className="portal-policies__detail-inline">
            <span className="portal-policies__detail-inline-label">
              {t("portal.policies.detail.sources")}
            </span>
            <span className="portal-policies__detail-inline-value">
              {realSources.join(" · ")}
            </span>
          </div>
        )}

        <h3 className="portal-policies__wizard-heading">
          {t("portal.policies.detail.recentActivity")}
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
                  <Button
                    type="button"
                    variant="quiet"
                    className="portal-policies__link portal-policies__activity-retry"
                    onClick={() => onRetry(item)}
                  >
                    {t("portal.policies.detail.retry")}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <Card padding="default">
            <EmptyState
              size="compact"
              title={t("portal.policies.detail.emptyActivity.title")}
              description={t(
                "portal.policies.detail.emptyActivity.description",
              )}
            />
          </Card>
        )}

        <Card padding="none" className="portal-policies__detail-stats">
          <StatTile
            label={t("portal.policies.stats.docsEnforced")}
            value={stats.enforced.toLocaleString()}
          />
          <StatTile
            label={t("portal.policies.stats.dataProcessed")}
            value={stats.dataProcessed}
          />
          <StatTile
            label={t("portal.policies.stats.activeFor")}
            value={stats.activeFor}
          />
        </Card>
      </Modal>
      <Modal
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        width="sm"
        title={t("portal.policies.detail.clearHistory.title")}
        footer={
          <div className="portal-policies__detail-foot">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmingClear(false)}
              disabled={busy}
            >
              {t("portal.policies.detail.clearHistory.cancel")}
            </Button>
            <Button
              variant="primary"
              accent="danger"
              size="sm"
              disabled={busy}
              onClick={() => {
                setConfirmingClear(false);
                onClearHistory?.();
              }}
            >
              {t("portal.policies.detail.clearHistory.confirm")}
            </Button>
          </div>
        }
      >
        {t("portal.policies.detail.clearHistory.body")}
      </Modal>
    </>
  );
}
