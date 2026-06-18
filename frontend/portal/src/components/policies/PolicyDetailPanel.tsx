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
          {category.label} policy
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
              Delete
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRun}
            disabled={busy}
            style={canDelete ? undefined : { marginRight: "auto" }}
          >
            Run now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onTogglePause}
            disabled={busy}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button size="sm" onClick={onEdit} disabled={busy}>
            Edit settings
          </Button>
        </div>
      }
    >
      <div className="portal-policies__detail-status">
        <StatusBadge tone={isPaused ? "warning" : "success"} pulse={!isPaused}>
          {isPaused ? "Paused" : "Active"}
        </StatusBadge>
        <span className="portal-policies__detail-meta">
          Runs on {state.runOn ?? "upload"} · output{" "}
          {state.outputMode === "new_file"
            ? "as a new file"
            : "as a new version"}
        </span>
      </div>

      <h3 className="portal-policies__wizard-heading">Enforces</h3>
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
          {config.scopeLabel} · originals stay untouched, the enforced version
          is saved alongside.
        </p>
      </Card>

      <h3 className="portal-policies__wizard-heading">Recent activity</h3>
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
            title="No activity yet"
            description="Documents will appear here once this policy runs."
          />
        </Card>
      )}

      <Card padding="none" className="portal-policies__detail-stats">
        <StatTile
          label="Docs enforced"
          value={stats.enforced.toLocaleString()}
        />
        <StatTile label="Data processed" value={stats.dataProcessed} />
        <StatTile label="Active" value={stats.activeFor} />
      </Card>

      {state.scopeTypes.length > 0 && (
        <Banner
          tone="neutral"
          title="Scoped"
          description={`Limited to: ${state.scopeTypes.join(", ")}`}
        />
      )}
    </Modal>
  );
}
