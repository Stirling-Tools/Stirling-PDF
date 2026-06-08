import PublicIcon from "@mui/icons-material/Public";
import ScheduleIcon from "@mui/icons-material/Schedule";
import HistoryIcon from "@mui/icons-material/History";
import DescriptionIcon from "@mui/icons-material/Description";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LockIcon from "@mui/icons-material/Lock";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { PanelHeader } from "@shared/components/PanelHeader";
import { Card } from "@shared/components/Card";
import { ChipFlow } from "@shared/components/ChipFlow";
import { StatusBadge } from "@shared/components/StatusBadge";
import { EmptyState } from "@shared/components/EmptyState";
import { Button } from "@shared/components/Button";
import { Banner } from "@shared/components/Banner";
import { ListRow } from "@shared/components/ListRow";
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
      <PanelHeader
        icon={category.icon}
        title={category.label}
        subtitle={
          state.docsEnforced24h > 0
            ? `${state.docsEnforced24h} enforced today`
            : undefined
        }
        onBack={onBack}
        actions={
          <StatusBadge
            tone={isPaused ? "warning" : "success"}
            showDot
            pulse={!isPaused}
          >
            {isPaused ? "Paused" : "Active"}
          </StatusBadge>
        }
      />

      <div className="pol-scroll">
        {/* Enforces */}
        <div>
          <p className="pol-section-label">Enforces</p>
          <Card padding="default" accent={isPaused ? "amber" : "blue"}>
            <div className="pol-rule-flow">
              <ChipFlow items={config.rules} separator="arrow" />
            </div>
            <div className="pol-meta-row">
              <span className="pol-meta-item">
                <PublicIcon sx={{ fontSize: "0.8rem" }} />
                {config.scopeLabel}
              </span>
              <span className="pol-meta-item">
                <ScheduleIcon sx={{ fontSize: "0.8rem" }} />
                On save &amp; export
              </span>
            </div>
            <div className="pol-note">
              <HistoryIcon sx={{ fontSize: "0.8rem" }} />
              Originals stay untouched • Enforced version saved alongside
            </div>
          </Card>
        </div>

        {/* Recent Activity */}
        <div>
          <p className="pol-section-label">Recent Activity</p>
          {config.activity.length > 0 ? (
            <Card padding="none">
              {config.activity.map((item, i) => (
                <ListRow
                  key={i}
                  divider={i > 0}
                  leadingTone={
                    item.status === "flagged" ? "warning" : "success"
                  }
                  leading={
                    item.status === "flagged" ? (
                      <WarningAmberIcon sx={{ fontSize: "0.85rem" }} />
                    ) : (
                      <CheckCircleIcon sx={{ fontSize: "0.85rem" }} />
                    )
                  }
                  title={item.doc}
                  description={item.action}
                  meta={item.time}
                />
              ))}
            </Card>
          ) : (
            <Card padding="default">
              <EmptyState
                size="compact"
                icon={<DescriptionIcon sx={{ fontSize: "1.5rem" }} />}
                title="No activity yet"
                description="Documents will appear here once this policy runs."
              />
            </Card>
          )}
        </div>

        {/* Stats — one grouped card with divided columns, matching the
            prototype's quiet summary footer (intentionally unlabelled). */}
        <Card padding="none">
          <div className="pol-stats">
            <div className="pol-stat">
              <span className="pol-stat-value">
                {config.stats.enforced.toLocaleString()}
              </span>
              <span className="pol-stat-label">Docs enforced</span>
            </div>
            <div className="pol-stat">
              <span className="pol-stat-value">
                {config.stats.dataProcessed}
              </span>
              <span className="pol-stat-label">Data processed</span>
            </div>
            <div className="pol-stat">
              <span className="pol-stat-value">{config.stats.activeFor}</span>
              <span className="pol-stat-label">Active</span>
            </div>
          </div>
        </Card>

        {!canConfigure && (
          <Banner
            tone="neutral"
            icon={<LockIcon sx={{ fontSize: "1rem" }} />}
            description="Managed by your organization. Contact an admin to change settings."
          />
        )}
      </div>

      {canConfigure && (
        <div className="pol-footer">
          <Button
            variant="ghost"
            accent="red"
            size="sm"
            leadingIcon={<DeleteOutlineIcon sx={{ fontSize: "0.9rem" }} />}
            onClick={onDelete}
            style={{ marginRight: "auto" }}
          >
            Delete
          </Button>
          <Button variant="outline" size="sm" onClick={onTogglePause}>
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button variant="gradient" size="sm" onClick={onEditSettings}>
            Edit Settings
          </Button>
        </div>
      )}
    </div>
  );
}
