import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchPolicies,
  type CatalogueEntry,
  type PoliciesResponse,
} from "@portal/api/policies";
import { policyIcon } from "@portal/components/policies/policyIcons";
import "@portal/components/PolicySummary.css";

/**
 * Each row's display state collapses a category's facts into one of three
 * mutually-exclusive shapes:
 *
 *   - `locked`  — a coming-soon category; show a "Soon" affordance
 *   - `active`  — a configured policy that's enabled; offer "Configure"
 *   - `off`     — available but not set up (or paused); offer "Set up"
 */
type RowState = "locked" | "active" | "off";

interface PolicyRow {
  entry: CatalogueEntry;
  state: RowState;
}

const STATE_BADGE: Record<
  RowState,
  { tone: "success" | "neutral" | "info"; label: string }
> = {
  active: { tone: "success", label: "Active" },
  off: { tone: "neutral", label: "Off" },
  locked: { tone: "info", label: "Soon" },
};

function toRow(entry: CatalogueEntry): PolicyRow {
  if (entry.category.comingSoon) return { entry, state: "locked" };
  const active = entry.policy?.state.status === "active";
  return { entry, state: active ? "active" : "off" };
}

export function PolicySummary() {
  const { setActiveView } = useView();
  const state = useAsync<PoliciesResponse>(() => fetchPolicies(), []);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const goToPolicies = () => setActiveView("policies");

  const columns: TableColumn<PolicyRow>[] = [
    {
      key: "category",
      header: "Policy",
      render: ({ entry }) => (
        <div className="portal-policysum__cat">
          <span className="portal-policysum__icon" aria-hidden>
            {policyIcon(entry.category.icon)}
          </span>
          <div className="portal-policysum__cat-text">
            <strong>{entry.category.label}</strong>
            <span>{entry.category.desc}</span>
          </div>
        </div>
      ),
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
      render: ({ entry, state }) => (
        <span className="portal-policysum__rule">
          {state === "active" ? entry.config.summary : "No rule enforced yet"}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "9rem",
      render: ({ state }) => {
        if (state === "locked") {
          return (
            <Button size="sm" variant="ghost" onClick={goToPolicies}>
              Coming soon
            </Button>
          );
        }
        return (
          <Button
            size="sm"
            variant={state === "active" ? "ghost" : "outline"}
            onClick={goToPolicies}
          >
            {state === "active" ? "Configure" : "Set up"}
          </Button>
        );
      },
    },
  ];

  const rows: PolicyRow[] = data?.catalogue.map(toRow) ?? [];

  return (
    <section className="portal-policysum" aria-label="What runs on your PDFs">
      <Card padding="none">
        <header className="portal-policysum__head">
          <div>
            <h2 className="portal-policysum__title">What runs on your PDFs</h2>
            <p className="portal-policysum__sub">
              Standing automations every document passes through, regardless of
              which pipeline handles it.
            </p>
          </div>
          {data && (
            <StatusBadge tone="info" size="sm">
              {data.summary.active} / {data.summary.categories} active
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
            description="Once policies are configured, the categories appear here."
          />
        )}

        {data && rows.length > 0 && (
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.entry.category.id}
            onRowClick={goToPolicies}
          />
        )}
      </Card>
    </section>
  );
}
