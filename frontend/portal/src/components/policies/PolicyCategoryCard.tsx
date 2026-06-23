import { StatusBadge } from "@shared/components";
import { Button } from "@shared/components/Button";
import type { CatalogueEntry } from "@portal/api/policies";
import { policyIcon } from "@portal/components/policies/policyIcons";
import "@portal/views/Policies.css";

interface PolicyCategoryCardProps {
  entry: CatalogueEntry;
  onOpen: (entry: CatalogueEntry) => void;
}

export function PolicyCategoryCard({ entry, onOpen }: PolicyCategoryCardProps) {
  const { category, policy } = entry;
  const comingSoon = category.comingSoon === true;

  if (comingSoon) {
    return (
      <div className="portal-policies__row portal-policies__row--locked">
        <span className="portal-policies__cat-icon portal-policies__cat-icon--neutral" aria-hidden>
          {policyIcon(category.icon)}
        </span>
        <span className="portal-policies__row-name">{category.label}</span>
        <Button variant="ghost" size="sm" style={{ "--sui-btn-fg": "var(--color-text-3)" }}>
          Upgrade to enterprise
        </Button>
      </div>
    );
  }

  const rightSection = policy ? (
    <StatusBadge
      tone={policy.state.status === "paused" ? "warning" : "success"}
      size="sm"
      pulse={policy.state.status !== "paused"}
    >
      {policy.state.status === "paused" ? "Paused" : "Active"}
    </StatusBadge>
  ) : (
    <span className="portal-policies__setup-link">Set up</span>
  );

  return (
    <Button
      variant="ghost"
      onClick={() => onOpen(entry)}
      style={{ "--sui-btn-fg": "var(--color-text-1)" }}
      leftSection={
        <span
          className={`portal-policies__cat-icon portal-policies__cat-icon--${category.tone}`}
          aria-hidden
        >
          {policyIcon(category.icon)}
        </span>
      }
      rightSection={rightSection}
    >
      {category.label}
    </Button>
  );
}
