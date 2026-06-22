import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  StatusBadge,
  type StatusTone,
  Table,
  type TableColumn,
} from "@shared/components";
import {
  promoteToPolicy,
  type PromotedPipeline,
  type PromotedStatus,
} from "@portal/api/pipelines";

const STATUS_TONE: Record<PromotedStatus, StatusTone> = {
  deployed: "success",
  staged: "info",
  review: "warning",
};

/** Translation key suffixes for each promoted-pipeline status badge. */
const STATUS_LABEL_KEY: Record<PromotedStatus, string> = {
  deployed: "deployed",
  staged: "staged",
  review: "review",
};

/** Per-row promote-to-policy lifecycle, kept local until a backend exists. */
type PromoteState = "idle" | "pending" | "done";

interface PromotedPipelinesProps {
  promoted: PromotedPipeline[];
}

/**
 * Flows that started as Editor watch-folder automations and were promoted into
 * the portal. Each keeps a pointer back to the watch folder it grew from, and
 * offers a one-click path to lift its rules into a fleet-wide org policy.
 */
export function PromotedPipelines({ promoted }: PromotedPipelinesProps) {
  const { t } = useTranslation();
  // Promote submits have no backend yet, so reflect acceptance per row locally.
  const [promoteState, setPromoteState] = useState<
    Record<string, PromoteState>
  >({});

  const onPromote = async (p: PromotedPipeline) => {
    setPromoteState((s) => ({ ...s, [p.id]: "pending" }));
    try {
      // TODO(backend): POST /v1/pipelines/{id}/promote-to-policy — stubbed,
      // resolves against the mock handler; treat success as accepted.
      await promoteToPolicy(p.id);
      setPromoteState((s) => ({ ...s, [p.id]: "done" }));
    } catch {
      setPromoteState((s) => ({ ...s, [p.id]: "idle" }));
    }
  };

  const columns = useMemo<TableColumn<PromotedPipeline>[]>(
    () => [
      {
        key: "name",
        header: t("pipelines.table.header.name"),
        render: (p) => (
          <div className="portal-pipelines__promoted-name">
            <strong>{p.name}</strong>
            <span className="portal-pipelines__promoted-when">
              {p.promotedAt}
            </span>
          </div>
        ),
      },
      {
        key: "docType",
        header: t("pipelines.promoted.table.sourceDocType"),
        render: (p) => (
          <span className="portal-pipelines__promoted-muted">
            {p.sourceDocType}
          </span>
        ),
      },
      {
        key: "watchFolder",
        header: t("pipelines.promoted.table.watchFolder"),
        render: (p) => (
          <code className="portal-pipelines__promoted-folder">
            {p.watchFolder}
          </code>
        ),
      },
      {
        key: "status",
        header: t("pipelines.promoted.table.status"),
        render: (p) => (
          <StatusBadge tone={STATUS_TONE[p.status]} size="sm">
            {t(`pipelines.promoted.status.${STATUS_LABEL_KEY[p.status]}`)}
          </StatusBadge>
        ),
      },
      {
        key: "promote",
        header: "",
        align: "right",
        width: "11rem",
        render: (p) => {
          const state = promoteState[p.id] ?? "idle";
          if (state === "done") {
            return (
              <StatusBadge tone="success" size="sm">
                {t("pipelines.promoted.policyCreated")}
              </StatusBadge>
            );
          }
          return (
            <Button
              variant="outline"
              size="sm"
              loading={state === "pending"}
              onClick={() => onPromote(p)}
            >
              {t("pipelines.promoted.promoteToPolicy")}
            </Button>
          );
        },
      },
    ],
    [promoteState, t],
  );

  return (
    <Table<PromotedPipeline>
      className="portal-pipelines__promoted"
      columns={columns}
      rows={promoted}
      rowKey={(p) => p.id}
    />
  );
}
