import { useMemo, useState } from "react";
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

const STATUS_LABEL: Record<PromotedStatus, string> = {
  deployed: "Deployed",
  staged: "Staged",
  review: "Needs review",
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
        header: "Pipeline",
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
        header: "Source doc type",
        render: (p) => (
          <span className="portal-pipelines__promoted-muted">
            {p.sourceDocType}
          </span>
        ),
      },
      {
        key: "watchFolder",
        header: "Watch folder",
        render: (p) => (
          <code className="portal-pipelines__promoted-folder">
            {p.watchFolder}
          </code>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (p) => (
          <StatusBadge tone={STATUS_TONE[p.status]} size="sm">
            {STATUS_LABEL[p.status]}
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
                Policy created
              </StatusBadge>
            );
          }
          return (
            <Button
              variant="outlined"
              size="sm"
              loading={state === "pending"}
              onClick={() => onPromote(p)}
            >
              Promote to policy
            </Button>
          );
        },
      },
    ],
    [promoteState],
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
