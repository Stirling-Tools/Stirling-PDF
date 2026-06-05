import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import PublicIcon from "@mui/icons-material/Public";
import ScheduleIcon from "@mui/icons-material/Schedule";
import HistoryIcon from "@mui/icons-material/History";
import DescriptionIcon from "@mui/icons-material/Description";
import LockIcon from "@mui/icons-material/Lock";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import type {
  PolicyCategory,
  PolicyConfigDef,
  PolicyRowStatus,
  PolicyState,
} from "@app/types/policies";

interface PolicyDetailPanelProps {
  category: PolicyCategory;
  config: PolicyConfigDef;
  state: PolicyState;
  /** Derived display status (treats a spend-limit hit as paused). */
  status: PolicyRowStatus;
  canConfigure: boolean;
  onBack: () => void;
  onEditSettings: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}

/** Narrative view for a configured policy (Enforces / Activity / Stats). */
export function PolicyDetailPanel({
  category,
  config,
  state,
  status,
  canConfigure,
  onBack,
  onEditSettings,
  onTogglePause,
  onDelete,
}: PolicyDetailPanelProps) {
  const isPaused = status === "paused";
  return (
    <div className="pol-detail">
      {/* Header */}
      <div className="pol-header">
        <button className="pol-icon-btn" onClick={onBack} aria-label="Back">
          <ChevronLeftIcon sx={{ fontSize: "1.1rem" }} />
        </button>
        <span className="pol-header-icon">{category.icon}</span>
        <div className="pol-header-text">
          <span className="pol-header-title">{category.label}</span>
          <span className="pol-header-sub">
            {state.docsEnforced24h > 0
              ? `${state.docsEnforced24h} enforced today`
              : "Policy"}
          </span>
        </div>
        {isPaused ? (
          <span className="pol-badge pol-badge-paused">Paused</span>
        ) : (
          <span className="pol-badge pol-badge-active">
            <span className="pol-badge-dot" />
            Active
          </span>
        )}
      </div>

      <div className="pol-scroll">
        {/* Enforces */}
        <div className="pol-card pol-card-pad">
          <p className="pol-section-label">Enforces</p>
          <div className="pol-rule-flow">
            {config.rules.map((rule, i) => (
              <span key={rule} className="pol-rule-flow-item">
                {i > 0 && (
                  <ArrowForwardIcon
                    sx={{ fontSize: "0.7rem", color: "var(--text-muted)" }}
                  />
                )}
                <span className="pol-rule-chip">{rule}</span>
              </span>
            ))}
          </div>
          <div className="pol-meta-row">
            <span className="pol-meta-item">
              <PublicIcon sx={{ fontSize: "0.75rem" }} />
              {config.scopeLabel}
            </span>
            <span className="pol-meta-item">
              <ScheduleIcon sx={{ fontSize: "0.75rem" }} />
              On save &amp; export
            </span>
          </div>
          <div className="pol-note">
            <HistoryIcon sx={{ fontSize: "0.75rem" }} />
            Originals stay untouched • Enforced version saved alongside
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <p className="pol-section-label">Recent Activity</p>
          <div className="pol-empty">
            <DescriptionIcon
              sx={{
                fontSize: "1.5rem",
                color: "var(--text-muted)",
                opacity: 0.4,
              }}
            />
            <p className="pol-empty-title">No activity yet</p>
            <p className="pol-empty-sub">
              Documents will appear here once this policy runs.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="pol-stats">
          {[
            {
              value: config.stats.enforced.toLocaleString() || "0",
              label: "Docs enforced",
            },
            {
              value: config.stats.dataProcessed || "0",
              label: "Data processed",
            },
            { value: config.stats.activeFor || "—", label: "Active" },
          ].map((s) => (
            <div key={s.label} className="pol-stat">
              <p className="pol-stat-value">{s.value}</p>
              <p className="pol-stat-label">{s.label}</p>
            </div>
          ))}
        </div>

        {!canConfigure && (
          <div className="pol-managed-inline">
            <LockIcon sx={{ fontSize: "0.85rem" }} />
            Managed by your organization. Contact an admin to change settings.
          </div>
        )}
      </div>

      {/* Footer */}
      {canConfigure && (
        <div className="pol-footer">
          <button className="pol-btn-danger" onClick={onDelete}>
            <DeleteOutlineIcon sx={{ fontSize: "0.8rem" }} />
            Delete
          </button>
          <button className="pol-btn-ghost" onClick={onTogglePause}>
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button className="pol-btn-primary" onClick={onEditSettings}>
            Edit Settings
          </button>
        </div>
      )}
    </div>
  );
}
