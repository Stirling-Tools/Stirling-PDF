import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchPolicies,
  POLICY_CATEGORY_META,
  tierMeetsRequirement,
  type PoliciesResponse,
  type PolicyCategoryConfig,
} from "@portal/api/policies";
import "@portal/components/PolicySummary.css";

/**
 * Each row's display state collapses three policy facts into one of three
 * mutually-exclusive shapes:
 *
 *   - `locked`  — the category requires a higher tier; show an upgrade nudge
 *   - `active`  — enabled and editable; offer "Configure"
 *   - `off`     — editable but disabled; offer "Turn on"
 *
 * Locked takes precedence over enabled because a free user can't act on a
 * pro/enterprise category regardless of whether the fixture marks it enabled.
 */
type RowState = "locked" | "active" | "off";

interface PolicyRow {
  config: PolicyCategoryConfig;
  state: RowState;
}

const STATE_BADGE: Record<
  RowState,
  { tone: "success" | "neutral" | "info"; label: string }
> = {
  active: { tone: "success", label: "Active" },
  off: { tone: "neutral", label: "Off" },
  locked: { tone: "info", label: "Upgrade" },
};

function toRow(config: PolicyCategoryConfig, canEdit: boolean): PolicyRow {
  if (!canEdit) return { config, state: "locked" };
  return { config, state: config.enabled ? "active" : "off" };
}

export function PolicySummary() {
  const { tier } = useTier();
  const { setActiveView } = useView();
  const state = useAsync<PoliciesResponse>(() => fetchPolicies(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const goToPolicies = () => setActiveView("policies");

  const columns: TableColumn<PolicyRow>[] = [
    {
      key: "category",
      header: "Policy",
      render: ({ config }) => {
        const meta = POLICY_CATEGORY_META[config.category];
        return (
          <div className="portal-policysum__cat">
            <span className="portal-policysum__icon" aria-hidden>
              {meta.icon}
            </span>
            <div className="portal-policysum__cat-text">
              <strong>{meta.label}</strong>
              <span>{meta.blurb}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width: "7rem",
      render: ({ state }) => {
        const badge = STATE_BADGE[state];
        return (
          <StatusBadge tone={badge.tone} size="sm">
            {badge.label}
          </StatusBadge>
        );
      },
    },
    {
      key: "rule",
      header: "Active rule",
      render: ({ config, state }) => (
        <span className="portal-policysum__rule">
          {state === "off" ? "No rule enforced yet" : config.summary}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "9rem",
      render: ({ config, state }) => {
        if (state === "locked") {
          return (
            <Button size="sm" variant="ghost" onClick={goToPolicies}>
              {config.requiredTier === "enterprise" ? "Enterprise" : "Upgrade"}
            </Button>
          );
        }
        return (
          <Button
            size="sm"
            variant={state === "active" ? "ghost" : "outline"}
            onClick={goToPolicies}
          >
            {state === "active" ? "Configure" : "Turn on"}
          </Button>
        );
      },
    },
  ];

  const rows: PolicyRow[] =
    data?.categories.map((c) =>
      toRow(c, tierMeetsRequirement(tier, c.requiredTier)),
    ) ?? [];

  return (
    <section className="portal-policysum" aria-label="What runs on your PDFs">
      <Card padding="none">
        <header className="portal-policysum__head">
          <div>
            <h2 className="portal-policysum__title">What runs on your PDFs</h2>
            <p className="portal-policysum__sub">
              Org-wide rules every document passes through, regardless of which
              pipeline handles it.
            </p>
          </div>
          {data && (
            <StatusBadge tone="info" size="sm">
              {data.summary.activePolicies} / {data.summary.totalCategories}{" "}
              active
            </StatusBadge>
          )}
        </header>

        {isLoading && (
          <div className="portal-policysum__loading" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="portal-policysum__loading-row">
                <Skeleton width="9rem" />
                <Skeleton width="60%" height="0.625rem" />
              </div>
            ))}
          </div>
        )}

        {isEmpty && (
          <EmptyState
            size="compact"
            title="No policies yet"
            description="Once policies are configured, the five categories appear here."
          />
        )}

        {data && rows.length > 0 && (
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.config.category}
            onRowClick={goToPolicies}
          />
        )}
      </Card>
    </section>
  );
}
