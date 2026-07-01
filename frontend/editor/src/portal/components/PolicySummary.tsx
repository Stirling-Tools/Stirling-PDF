import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusBadge,
  Table,
  type TableColumn,
} from "@app/ui";
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
  { tone: "success" | "neutral" | "info"; labelKey: string }
> = {
  active: { tone: "success", labelKey: "portal.policySummary.state.active" },
  off: { tone: "neutral", labelKey: "portal.policySummary.state.off" },
  locked: { tone: "info", labelKey: "portal.policySummary.state.soon" },
};

function toRow(entry: CatalogueEntry): PolicyRow {
  if (entry.category.comingSoon) return { entry, state: "locked" };
  const active = entry.policy?.state.status === "active";
  return { entry, state: active ? "active" : "off" };
}

export function PolicySummary() {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  const state = useAsync<PoliciesResponse>(() => fetchPolicies(), []);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const goToPolicies = () => setActiveView("policies");

  const columns: TableColumn<PolicyRow>[] = [
    {
      key: "category",
      header: t("portal.policySummary.column.policy"),
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
      header: t("portal.policySummary.column.status"),
      width: "7rem",
      render: ({ state }) => {
        const badge = STATE_BADGE[state];
        return (
          <StatusBadge tone={badge.tone} size="sm">
            {t(badge.labelKey)}
          </StatusBadge>
        );
      },
    },
    {
      key: "rule",
      header: t("portal.policySummary.column.activeRule"),
      render: ({ entry, state }) => (
        <span className="portal-policysum__rule">
          {state === "active"
            ? entry.config.summary
            : t("portal.policySummary.noRule")}
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
              {t("portal.policySummary.action.comingSoon")}
            </Button>
          );
        }
        return (
          <Button
            size="sm"
            variant={state === "active" ? "ghost" : "outline"}
            onClick={goToPolicies}
          >
            {state === "active"
              ? t("portal.policySummary.action.configure")
              : t("portal.policySummary.action.setUp")}
          </Button>
        );
      },
    },
  ];

  const rows: PolicyRow[] = data?.catalogue?.map(toRow) ?? [];

  return (
    <section
      className="portal-policysum"
      aria-label={t("portal.policySummary.title")}
    >
      <Card padding="none">
        <header className="portal-policysum__head">
          <div>
            <h2 className="portal-policysum__title">
              {t("portal.policySummary.title")}
            </h2>
            <p className="portal-policysum__sub">
              {t("portal.policySummary.subtitle")}
            </p>
          </div>
          {data?.summary && (
            <StatusBadge tone="info" size="sm">
              {t("portal.policySummary.activeSummary", {
                active: data.summary.active,
                total: data.summary.categories,
              })}
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
            title={t("portal.policySummary.empty.title")}
            description={t("portal.policySummary.empty.description")}
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
