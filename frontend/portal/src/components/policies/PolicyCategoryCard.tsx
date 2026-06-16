import { Card, Chip, StatusBadge } from "@shared/components";
import {
  POLICY_CATEGORY_META,
  type PolicyCategoryConfig,
} from "@portal/api/policies";
import "@portal/views/Policies.css";

interface PolicyCategoryCardProps {
  config: PolicyCategoryConfig;
  /** False when the active tier is below the category's required tier. */
  editable: boolean;
  onOpen: (category: PolicyCategoryConfig) => void;
}

/**
 * One card per policy category. Editable cards open the designer on click;
 * locked cards (tier below the category's requirement) stay inert and show an
 * upgrade nudge instead of the edit affordance.
 */
export function PolicyCategoryCard({
  config,
  editable,
  onOpen,
}: PolicyCategoryCardProps) {
  const meta = POLICY_CATEGORY_META[config.category];
  const overrideCount = config.overrides.length;

  return (
    <Card
      className={
        "portal-policies__card" +
        (editable ? "" : " portal-policies__card--locked")
      }
      interactive={editable}
      onClick={editable ? () => onOpen(config) : undefined}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onKeyDown={
        editable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(config);
              }
            }
          : undefined
      }
    >
      <header className="portal-policies__card-head">
        <span
          className={`portal-policies__cat-icon portal-policies__cat-icon--${meta.tone}`}
          aria-hidden
        >
          {meta.icon}
        </span>
        <div className="portal-policies__card-titles">
          <h2 className="portal-policies__card-title">{meta.label}</h2>
          <span className="portal-policies__card-blurb">{meta.blurb}</span>
        </div>
        {editable ? (
          <StatusBadge
            tone={config.enabled ? "success" : "neutral"}
            size="sm"
            pulse={config.enabled}
          >
            {config.enabled ? "Enabled" : "Disabled"}
          </StatusBadge>
        ) : (
          <Chip
            tone="amber"
            size="sm"
            leadingIcon={<span aria-hidden>🔒</span>}
          >
            Locked
          </Chip>
        )}
      </header>

      {editable ? (
        <>
          <p className="portal-policies__card-summary">{config.summary}</p>
          <footer className="portal-policies__card-foot">
            <Chip tone="neutral" size="sm">
              {overrideCount} doc-type{overrideCount === 1 ? "" : "s"}{" "}
              overridden
            </Chip>
            <span className="portal-policies__card-meta">
              Edited {config.lastEditedAt} by {config.lastEditedBy}
            </span>
          </footer>
        </>
      ) : (
        <p className="portal-policies__card-locked-note">
          Editing {meta.label} policy requires the{" "}
          <strong>{config.requiredTier}</strong> plan.
        </p>
      )}
    </Card>
  );
}
