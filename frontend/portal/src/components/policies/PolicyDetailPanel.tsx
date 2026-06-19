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
import { humanizeEndpoint, type DecoratedPolicy } from "@portal/api/policies";
import { policyIcon } from "@portal/components/policies/policyIcons";
import "@portal/views/Policies.css";

interface PolicyDetailPanelProps {
  /** The configured policy being viewed, or null when closed. */
  policy: DecoratedPolicy | null;
  /** Whether a lifecycle action (run/pause/delete) is in flight. */
  busy?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRun: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}

const ACTIVITY_TONE = {
  enforced: "success",
  flagged: "warning",
  processing: "info",
} as const;

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
}: PolicyDetailPanelProps) {
  const { t } = useTranslation();
  if (!policy) return null;
  const { category, config, state, steps, stats, activity } = policy;
  const isPaused = state.status === "paused";
  const canDelete = state.isDefault !== true;
  const enforceItems = steps.length > 0 ? steps.map((s) => s.operation) : [];

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
          <Button
            variant="outline"
            size="sm"
            onClick={onRun}
            disabled={busy}
            style={canDelete ? undefined : { marginRight: "auto" }}
          >
            {t("policies.detail.actions.runNow")}
          </Button>
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
        <p className="portal-policies__enforce-note">
          {t("policies.detail.enforceNote", { scope: config.scopeLabel })}
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
                className={`portal-policies__activity-dot portal-policies__activity-dot--${ACTIVITY_TONE[item.status]}`}
                aria-hidden
              />
              <span className="portal-policies__activity-text">
                <span className="portal-policies__activity-doc">
                  {item.doc}
                </span>
                <span className="portal-policies__activity-action">
                  {item.action}
                </span>
              </span>
              <span className="portal-policies__activity-time">
                {item.time}
              </span>
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
